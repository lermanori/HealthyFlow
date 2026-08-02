import AuthenticationServices
import Capacitor
import CryptoKit
import Security
import UIKit

/// Native Google sign-in for HealthyFlow's iOS shell.
///
/// This mirrors `AppleSignInPlugin`: the app obtains an OpenID Connect ID token
/// natively and hands it to Supabase via `signInWithIdToken`, rather than
/// bouncing through Supabase's hosted OAuth redirect. That keeps the WebView
/// mounted throughout, so there is no deep-link callback to route back into a
/// React effect. See docs/adr/0006-native-google-sign-in-on-ios.md.
///
/// The exchange is a standard RFC 8252 native-app authorization-code flow with
/// PKCE against Google directly. Google treats iOS apps as public clients, so
/// there is no client secret; PKCE is what binds the redirect to this request.
@objc(GoogleSignInPlugin)
public final class GoogleSignInPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GoogleSignInPlugin"
    public let jsName = "GoogleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)
    ]

    private static let authorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth"
    private static let tokenEndpoint = "https://oauth2.googleapis.com/token"

    private var pendingCall: CAPPluginCall?
    private var session: ASWebAuthenticationSession?

    @objc func signIn(_ call: CAPPluginCall) {
        guard let clientId = call.getString("clientId"), !clientId.isEmpty else {
            call.reject(
                "Google sign-in is missing its iOS client ID.",
                "google_sign_in_not_configured"
            )
            return
        }

        DispatchQueue.main.async {
            guard self.pendingCall == nil else {
                call.reject(
                    "Another Google sign-in is already in progress.",
                    "google_sign_in_in_progress"
                )
                return
            }

            do {
                let verifier = try Self.randomURLSafeString()
                let redirectScheme = Self.reversedClientId(from: clientId)
                let redirectURI = "\(redirectScheme):/oauth2redirect"

                guard let authorizationURL = Self.authorizationURL(
                    clientId: clientId,
                    redirectURI: redirectURI,
                    codeChallenge: Self.codeChallenge(for: verifier)
                ) else {
                    call.reject(
                        "Could not build the Google sign-in request.",
                        "google_sign_in_failed"
                    )
                    return
                }

                let session = ASWebAuthenticationSession(
                    url: authorizationURL,
                    callbackURLScheme: redirectScheme
                ) { [weak self] callbackURL, error in
                    self?.handleRedirect(
                        callbackURL: callbackURL,
                        error: error,
                        clientId: clientId,
                        redirectURI: redirectURI,
                        verifier: verifier
                    )
                }

                session.presentationContextProvider = self
                // Google requires a fresh account chooser rather than silently
                // reusing whichever account Safari is already signed into.
                session.prefersEphemeralWebBrowserSession = false

                self.pendingCall = call
                self.session = session

                if !session.start() {
                    call.reject(
                        "Could not open the Google sign-in page.",
                        "google_sign_in_failed"
                    )
                    self.finish()
                }
            } catch {
                call.reject(
                    "Could not prepare Google sign-in.",
                    "google_sign_in_failed",
                    error
                )
            }
        }
    }

    private func handleRedirect(
        callbackURL: URL?,
        error: Error?,
        clientId: String,
        redirectURI: String,
        verifier: String
    ) {
        if let error {
            let isCancellation = (error as? ASWebAuthenticationSessionError)?.code
                == .canceledLogin
            pendingCall?.reject(
                isCancellation
                    ? "Google sign-in was cancelled."
                    : "Google could not complete sign-in.",
                isCancellation ? "google_sign_in_cancelled" : "google_sign_in_failed",
                error
            )
            finish()
            return
        }

        guard
            let callbackURL,
            let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false),
            let code = components.queryItems?.first(where: { $0.name == "code" })?.value
        else {
            let providerError = callbackURL
                .flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: false) }?
                .queryItems?
                .first { $0.name == "error" }?
                .value

            if providerError == "access_denied" {
                pendingCall?.reject(
                    "Google sign-in was cancelled.",
                    "google_sign_in_cancelled"
                )
            } else {
                pendingCall?.reject(
                    "Google sign-in did not return an authorization code.",
                    "google_sign_in_invalid"
                )
            }
            finish()
            return
        }

        exchange(
            code: code,
            clientId: clientId,
            redirectURI: redirectURI,
            verifier: verifier
        )
    }

    /// Swaps the authorization code for an ID token. Google rejects the exchange
    /// unless the verifier matches the challenge sent with the request.
    private func exchange(
        code: String,
        clientId: String,
        redirectURI: String,
        verifier: String
    ) {
        guard let url = URL(string: Self.tokenEndpoint) else {
            pendingCall?.reject("Could not reach Google.", "google_sign_in_failed")
            finish()
            return
        }

        var body = URLComponents()
        body.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "code", value: code),
            URLQueryItem(name: "code_verifier", value: verifier),
            URLQueryItem(name: "grant_type", value: "authorization_code"),
            URLQueryItem(name: "redirect_uri", value: redirectURI)
        ]

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(
            "application/x-www-form-urlencoded",
            forHTTPHeaderField: "Content-Type"
        )
        request.httpBody = body.percentEncodedQuery?.data(using: .utf8)
        // Without this the request can hang indefinitely on a stalled network,
        // which is exactly the failure mode this plugin replaces.
        request.timeoutInterval = 30

        URLSession.shared.dataTask(with: request) { [weak self] data, _, error in
            guard let self else { return }

            if let error {
                self.resolveOnMain {
                    self.pendingCall?.reject(
                        "Could not reach Google to finish sign-in.",
                        "google_sign_in_network",
                        error
                    )
                    self.finish()
                }
                return
            }

            guard
                let data,
                let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                let idToken = payload["id_token"] as? String
            else {
                self.resolveOnMain {
                    self.pendingCall?.reject(
                        "Google did not return an identity token.",
                        "google_sign_in_invalid"
                    )
                    self.finish()
                }
                return
            }

            self.resolveOnMain {
                var result: [String: Any] = ["idToken": idToken]
                if let accessToken = payload["access_token"] as? String {
                    result["accessToken"] = accessToken
                }
                self.pendingCall?.resolve(result)
                self.finish()
            }
        }.resume()
    }

    private func resolveOnMain(_ work: @escaping () -> Void) {
        DispatchQueue.main.async(execute: work)
    }

    private func finish() {
        pendingCall = nil
        session = nil
    }

    /// Google's iOS redirect scheme is the client ID's domain-reversed form, e.g.
    /// `1234-abc.apps.googleusercontent.com` -> `com.googleusercontent.apps.1234-abc`.
    private static func reversedClientId(from clientId: String) -> String {
        clientId.split(separator: ".").reversed().joined(separator: ".")
    }

    private static func authorizationURL(
        clientId: String,
        redirectURI: String,
        codeChallenge: String
    ) -> URL? {
        var components = URLComponents(string: authorizationEndpoint)
        components?.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: "openid email profile"),
            URLQueryItem(name: "code_challenge", value: codeChallenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "prompt", value: "select_account")
        ]
        return components?.url
    }

    private static func randomURLSafeString() throws -> String {
        let byteCount = 32
        var bytes = [UInt8](repeating: 0, count: byteCount)
        let status = bytes.withUnsafeMutableBytes { buffer in
            guard let baseAddress = buffer.baseAddress else {
                return errSecParam
            }
            return SecRandomCopyBytes(kSecRandomDefault, byteCount, baseAddress)
        }
        guard status == errSecSuccess else {
            throw NSError(
                domain: NSOSStatusErrorDomain,
                code: Int(status),
                userInfo: [
                    NSLocalizedDescriptionKey:
                        "Could not create a secure Google sign-in verifier."
                ]
            )
        }
        return base64URLEncode(Data(bytes))
    }

    private static func codeChallenge(for verifier: String) -> String {
        base64URLEncode(Data(SHA256.hash(data: Data(verifier.utf8))))
    }

    private static func base64URLEncode(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

extension GoogleSignInPlugin: ASWebAuthenticationPresentationContextProviding {
    public func presentationAnchor(
        for session: ASWebAuthenticationSession
    ) -> ASPresentationAnchor {
        if let window = bridge?.viewController?.view.window {
            return window
        }
        return UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow } ?? UIWindow()
    }
}
