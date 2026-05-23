import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

WebBrowser.maybeCompleteAuthSession();

const issuer: string = 'https://ahmeds-auth-qaw8wn.eu1.zitadel.cloud';
const clientId: string = '374082527880594177';
const redirectUri = AuthSession.makeRedirectUri({
  scheme: 'zitadelexpo',
  path: 'auth',
});

const discovery = {
  authorizationEndpoint: `${issuer}/oauth/v2/authorize`,
  tokenEndpoint: `${issuer}/oauth/v2/token`,
  revocationEndpoint: `${issuer}/oauth/v2/revoke`,
  endSessionEndpoint: `${issuer}/oidc/v1/end_session`,
};

const tokenKeys = {
  accessToken: 'zitadel.access_token',
  refreshToken: 'zitadel.refresh_token',
  idToken: 'zitadel.id_token',
};

type StoredTokens = {
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
};

async function revokeTokenAsync(token: string, tokenTypeHint: AuthSession.TokenTypeHint) {
  const response = await fetch(discovery.revocationEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      token,
      token_type_hint: tokenTypeHint,
    }).toString(),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || `Token revocation failed with status ${response.status}.`);
  }
}

export default function HomeScreen() {
  const [tokens, setTokens] = useState<StoredTokens>({
    accessToken: null,
    refreshToken: null,
    idToken: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      scopes: ['openid', 'profile', 'email', 'offline_access'],
      usePKCE: true,
    },
    discovery
  );

  const isConfigured = useMemo(
    () => !issuer.includes('YOUR-INSTANCE') && clientId !== 'YOUR_CLIENT_ID',
    []
  );
  const isLoggedIn = Boolean(tokens.accessToken);

  const loadStoredTokens = useCallback(async () => {
    const [accessToken, refreshToken, idToken] = await Promise.all([
      SecureStore.getItemAsync(tokenKeys.accessToken),
      SecureStore.getItemAsync(tokenKeys.refreshToken),
      SecureStore.getItemAsync(tokenKeys.idToken),
    ]);

    setTokens({ accessToken, refreshToken, idToken });
  }, []);

  const storeTokens = useCallback(async (nextTokens: StoredTokens) => {
    await Promise.all([
      nextTokens.accessToken
        ? SecureStore.setItemAsync(tokenKeys.accessToken, nextTokens.accessToken)
        : SecureStore.deleteItemAsync(tokenKeys.accessToken),
      nextTokens.refreshToken
        ? SecureStore.setItemAsync(tokenKeys.refreshToken, nextTokens.refreshToken)
        : SecureStore.deleteItemAsync(tokenKeys.refreshToken),
      nextTokens.idToken
        ? SecureStore.setItemAsync(tokenKeys.idToken, nextTokens.idToken)
        : SecureStore.deleteItemAsync(tokenKeys.idToken),
    ]);

    setTokens(nextTokens);
  }, []);

  const clearStoredTokens = useCallback(async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(tokenKeys.accessToken),
      SecureStore.deleteItemAsync(tokenKeys.refreshToken),
      SecureStore.deleteItemAsync(tokenKeys.idToken),
    ]);

    setTokens({ accessToken: null, refreshToken: null, idToken: null });
  }, []);

  useEffect(() => {
    loadStoredTokens()
      .catch((error) => {
        setErrorMessage(error instanceof Error ? error.message : 'Could not load saved tokens.');
      })
      .finally(() => setIsLoading(false));
  }, [loadStoredTokens]);

  useEffect(() => {
    if (response?.type !== 'success') {
      if (response?.type === 'error') {
        setErrorMessage(response.error?.message ?? 'ZITADEL returned an authorization error.');
      }
      return;
    }

    const exchangeCode = async () => {
      if (!request?.codeVerifier) {
        throw new Error('Missing PKCE code verifier for token exchange.');
      }

      setIsBusy(true);
      setErrorMessage(null);

      const tokenResponse = await AuthSession.exchangeCodeAsync(
        {
          clientId,
          code: response.params.code,
          redirectUri,
          extraParams: {
            code_verifier: request.codeVerifier,
          },
        },
        discovery
      );

      await storeTokens({
        accessToken: tokenResponse.accessToken,
        refreshToken: tokenResponse.refreshToken ?? null,
        idToken: tokenResponse.idToken ?? null,
      });
    };

    exchangeCode()
      .catch((error) => {
        setErrorMessage(error instanceof Error ? error.message : 'Could not complete login.');
      })
      .finally(() => setIsBusy(false));
  }, [request?.codeVerifier, response, storeTokens]);

  const login = async () => {
    if (!isConfigured) {
      Alert.alert(
        'Configure ZITADEL first',
        'Replace YOUR-INSTANCE and YOUR_CLIENT_ID in app/(tabs)/index.tsx.'
      );
      return;
    }

    setErrorMessage(null);
    await promptAsync();
  };

  const logout = async () => {
    setIsBusy(true);
    setErrorMessage(null);

    try {
      if (tokens.refreshToken) {
        await revokeTokenAsync(tokens.refreshToken, AuthSession.TokenTypeHint.RefreshToken);
      } else if (tokens.accessToken) {
        await revokeTokenAsync(tokens.accessToken, AuthSession.TokenTypeHint.AccessToken);
      }

      if (tokens.idToken) {
        const logoutUrl = `${discovery.endSessionEndpoint}?${new URLSearchParams({
          id_token_hint: tokens.idToken,
          post_logout_redirect_uri: redirectUri,
        }).toString()}`;

        await WebBrowser.openAuthSessionAsync(logoutUrl, redirectUri);
      } else {
        await Linking.openURL(redirectUri).catch(() => null);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not complete logout.');
    } finally {
      await clearStoredTokens();
      setIsBusy(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>ZITADEL OIDC</Text>
        <Text style={styles.title}>Expo AuthSession</Text>
        <Text style={styles.subtitle}>
          Authorization Code Flow with PKCE using ZITADEL hosted login.
        </Text>
      </View>

      <View style={styles.panel}>
        <View style={styles.row}>
          <Text style={styles.label}>Status</Text>
          <Text style={[styles.status, isLoggedIn ? styles.statusSignedIn : styles.statusSignedOut]}>
            {isLoggedIn ? 'Logged in' : 'Logged out'}
          </Text>
        </View>

        <View style={styles.detailBlock}>
          <Text style={styles.label}>Redirect URI</Text>
          <Text style={styles.mono}>{redirectUri}</Text>
        </View>

        <View style={styles.detailBlock}>
          <Text style={styles.label}>Issuer</Text>
          <Text style={styles.mono}>{issuer}</Text>
        </View>

        {!isConfigured ? (
          <Text style={styles.warning}>
            Replace the placeholder issuer and client ID before trying the hosted login.
          </Text>
        ) : null}

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        {isLoggedIn ? (
          <Pressable
            disabled={isBusy}
            onPress={logout}
            style={({ pressed }) => [
              styles.button,
              styles.secondaryButton,
              (pressed || isBusy) && styles.buttonPressed,
            ]}>
            <Text style={styles.secondaryButtonText}>{isBusy ? 'Signing out...' : 'Logout'}</Text>
          </Pressable>
        ) : (
          <Pressable
            disabled={!request || isBusy}
            onPress={login}
            style={({ pressed }) => [
              styles.button,
              (!request || isBusy) && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}>
            <Text style={styles.buttonText}>{isBusy ? 'Signing in...' : 'Login with ZITADEL'}</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 24,
  },
  centered: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    gap: 8,
    marginBottom: 28,
    marginTop: 24,
  },
  eyebrow: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  title: {
    color: '#0F172A',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0,
  },
  subtitle: {
    color: '#475569',
    fontSize: 16,
    lineHeight: 24,
  },
  panel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 8,
    borderWidth: 1,
    gap: 18,
    padding: 20,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  status: {
    borderRadius: 999,
    fontSize: 14,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusSignedIn: {
    backgroundColor: '#DCFCE7',
    color: '#166534',
  },
  statusSignedOut: {
    backgroundColor: '#F1F5F9',
    color: '#475569',
  },
  detailBlock: {
    gap: 8,
  },
  mono: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderRadius: 6,
    borderWidth: 1,
    color: '#0F172A',
    fontFamily: 'Courier',
    fontSize: 13,
    lineHeight: 20,
    padding: 12,
  },
  warning: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderRadius: 6,
    borderWidth: 1,
    color: '#92400E',
    lineHeight: 20,
    padding: 12,
  },
  error: {
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444',
    borderRadius: 6,
    borderWidth: 1,
    color: '#991B1B',
    lineHeight: 20,
    padding: 12,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 8,
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  secondaryButton: {
    backgroundColor: '#0F172A',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
