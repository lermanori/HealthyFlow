import AuthenticationServices
import Capacitor
import CryptoKit
import Security
import UIKit

@objc(AppleSignInPlugin)
public final class AppleSignInPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleSignInPlugin"
    public let jsName = "AppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?
    private var currentNonce: String?
    private var authorizationController: ASAuthorizationController?

    @objc func signIn(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.pendingCall == nil else {
                call.reject("Another Apple sign-in is already in progress.", "apple_sign_in_in_progress")
                return
            }

            do {
                let nonce = try Self.randomNonce()
                let request = ASAuthorizationAppleIDProvider().createRequest()
                request.requestedScopes = [.fullName, .email]
                request.nonce = Self.sha256(nonce)

                let controller = ASAuthorizationController(authorizationRequests: [request])
                controller.delegate = self
                controller.presentationContextProvider = self

                self.pendingCall = call
                self.currentNonce = nonce
                self.authorizationController = controller
                controller.performRequests()
            } catch {
                call.reject("Could not prepare Apple sign-in.", "apple_sign_in_unavailable", error)
            }
        }
    }

    private func finish() {
        pendingCall = nil
        currentNonce = nil
        authorizationController = nil
    }

    private static func randomNonce() throws -> String {
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
                userInfo: [NSLocalizedDescriptionKey: "Could not create a secure Apple sign-in nonce."]
            )
        }
        return Data(bytes)
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }
}

extension AppleSignInPlugin: ASAuthorizationControllerDelegate {
    public func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard
            let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
            let tokenData = credential.identityToken,
            let identityToken = String(data: tokenData, encoding: .utf8),
            let nonce = currentNonce,
            let call = pendingCall
        else {
            pendingCall?.reject(
                "Apple sign-in did not return a valid identity token.",
                "apple_sign_in_invalid"
            )
            finish()
            return
        }

        var result: [String: Any] = [
            "identityToken": identityToken,
            "nonce": nonce
        ]
        if let email = credential.email {
            result["email"] = email
        }
        if let givenName = credential.fullName?.givenName {
            result["givenName"] = givenName
        }
        if let familyName = credential.fullName?.familyName {
            result["familyName"] = familyName
        }

        call.resolve(result)
        finish()
    }

    public func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        let authorizationError = error as? ASAuthorizationError
        if authorizationError?.code == .canceled {
            pendingCall?.reject(
                "Apple sign-in was cancelled.",
                "apple_sign_in_cancelled",
                error
            )
        } else {
            pendingCall?.reject(
                "Apple could not complete sign-in.",
                "apple_sign_in_failed",
                error
            )
        }
        finish()
    }
}

extension AppleSignInPlugin: ASAuthorizationControllerPresentationContextProviding {
    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        if let window = bridge?.viewController?.view.window {
            return window
        }
        return UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow } ?? UIWindow()
    }
}
