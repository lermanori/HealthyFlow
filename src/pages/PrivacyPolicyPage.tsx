import { Link } from 'react-router-dom'

const sections = [
  {
    title: 'Your Local day',
    body: [
      'On iPhone, your tasks, habits and progress, goals, schedules, food and weight entries, workouts, and settings are saved on your device. This Local day remains usable offline. Creating or claiming an account does not add Cloud backup, cross-device sync, or device transfer; these features cannot be obtained in v1.',
      'Local storage does not mean that every use of HealthyFlow stays on the device. AI requests, account services, support, notifications, and analytics involve the processing described below.',
      'The web app and accounts with existing server-held records may use our servers to store and retrieve product data. One developer-operated legacy account may also replicate a Local day to our servers. Cloud backup, sync, and device transfer are not offered to users in this version.',
    ],
  },
  {
    title: 'Account and technical information',
    body: [
      'For a claimed account, we process your name, email address, account identifier, password hash if you use a password, and authentication information from your chosen sign-in provider. A Guest can use the app without providing a name or email; when a Guest session connects, a server-side identifier supports AI access and usage limits.',
      'We keep AI-action balances and usage records, including the model used, request timing, token counts, and errors. Our services and hosting providers also process connection, device, browser, IP-address, and diagnostic information to operate the service and prevent abuse. Guest grant limits use a keyed value derived from the network IP address.',
    ],
  },
  {
    title: 'AI processing',
    body: [
      'When you use an AI feature, HealthyFlow sends your request through our backend to OpenAI. This can include your text, selected photos or text files, conversation history, and context used by the feature, such as your profile preferences, goals, habit progress, and relevant planning, calendar, or health records. Information stored locally can therefore leave the device when included in an AI request.',
      'Before the first AI request, HealthyFlow identifies the current AI provider, describes the information that may be shared, and asks for explicit permission. The current provider is OpenAI. If we begin sharing personal data with another AI provider, we will identify that provider and request permission again before sending data to it.',
      'We store assistant conversations, responses, proposed actions, and related metadata on our servers to provide chat history and complete requested actions. Archiving a conversation hides it from the chat list; it does not erase its stored messages. OpenAI states that API inputs and outputs are not used to train its models by default unless the API customer opts in. For the Chat Completions API HealthyFlow uses, OpenAI may retain customer content in abuse-monitoring logs for up to 30 days by default, or longer when legally required. Image inputs may be retained for manual review if automated safety systems detect potential child sexual abuse material.',
      'You can decline AI permission and continue using manual planning and tracking. You can later withdraw permission in Settings under Data & Privacy. After withdrawal, HealthyFlow blocks new AI requests unless you review the current disclosure and allow AI features again. Only include photos, files, health details, or other personal information that you want processed for that request.',
      'AI results can be incomplete or inaccurate. You are responsible for reviewing generated items, suggestions, nutrition estimates, or recommendations before relying on them.',
    ],
  },
  {
    title: 'Voice, calendar, and notifications',
    body: [
      'On iPhone, microphone access is used for Apple on-device transcription. HealthyFlow does not upload that microphone audio for transcription. If you send the resulting text to an AI feature, it is processed as described above. On the web, voice recognition is provided by your browser and may involve its speech-service provider.',
      'With your permission, Device Calendar reads event titles, times, notes, and locations and can write linked HealthyFlow items to calendars on your iPhone. This calendar integration runs on the device. Calendar content you include in an AI request is transmitted as described under AI processing.',
      'For accounts with an existing Cloud entitlement, the optional Google Calendar connection on the web uses Google authorization tokens and exchanges event data through our backend. It is separate from Device Calendar and is not offered through the native iPhone app.',
      'If you enable notifications, we process notification preferences and a device token or browser push subscription, and send notifications through Apple Push Notification service or your browser push provider. You can revoke microphone, calendar, and notification permissions in device or browser settings.',
    ],
  },
  {
    title: 'Analytics',
    body: [
      'We use PostHog to understand feature usage and diagnose problems. Analytics can include device and browser information, page visits, product events, a stable user identifier, and, when available, account name, email address, role, Guest status, and usage properties. Cookies and local storage help associate visits and activity.',
      'HealthyFlow does not record sessions or capture what is displayed on screen. Product events record that an action happened, such as logging a meal; they do not include the content of AI prompts, chat messages, task titles, or health entries.',
    ],
  },
  {
    title: 'Support and other services',
    body: [
      'When you use the Founders Club form, we store your request, message, account identifier, and reply address in our database so we can respond. Email sent to support@healthyflow.app is received by Resend and forwarded to our support inbox hosted by Google. This includes the sender and reply address, message, and any attachments. Forwarded support email is not stored in the app database.',
      'Food searches may send the food query to Open Food Facts to retrieve nutrition information. If you open an external nutrition source or other third-party link, that site receives the information associated with your visit under its own privacy practices.',
    ],
  },
  {
    title: 'How we use and share information',
    body: [
      'We use information to provide the features you use, maintain accounts and AI allowances, answer support requests, troubleshoot problems, understand usage, and protect the service from abuse.',
      'We do not sell your personal information. Providers involved in operating HealthyFlow include Netlify for the website, Railway for the backend, Supabase for database and authentication services, OpenAI for AI processing, PostHog for analytics, and Resend and Google for email. Optional sign-in, calendar, speech, notification, and nutrition services process the information described above.',
      'We require third-party processors acting for HealthyFlow to provide the same or equivalent protection for personal information described in this policy through their contractual and legal obligations. We review the published privacy, security, and retention terms relevant to the services we use.',
      'Information may be processed in countries other than the country where you live. The providers and services used determine where particular information is processed.',
      'We may disclose information if required by law, to protect rights and safety, or in connection with a merger, acquisition, financing, or sale of assets.',
    ],
  },
  {
    title: 'Retention, deletion, and your choices',
    body: [
      'Your Local day stays in the app storage on your device until it is deleted. Deleting the app or clearing its storage can permanently remove that data. Signing out does not delete the Local day, and uninstalling the app does not delete information already held by our servers or providers.',
      'We retain account records, stored product data, assistant history, and usage records while needed to provide the associated services. Support correspondence is retained as needed to handle requests and follow-up. Security records, operational logs, and backups may be retained separately where needed for security, service recovery, legal obligations, or disputes; retention varies by purpose and provider.',
      'Use Delete Account in Settings to delete your account and associated records from our app database. The app also clears the Local day for that identity on the current device. Copies you exported or hold on other devices are not removed by this action. Contact support if deletion or sign-in-provider cleanup reports a problem.',
      'The export option in Settings downloads the server-held account archive. It does not include records that exist only in your Local day, and it is not a backup of your device.',
      'Account deletion does not automatically erase support emails, PostHog records, or provider logs and backups. Contact support@healthyflow.app to request access, correction, export, or deletion of information held in those services, or to raise a privacy concern. We may need to verify your identity before acting on a request.',
    ],
  },
  {
    title: 'Security',
    body: [
      'We use reasonable administrative, technical, and organizational safeguards designed to protect your information. No online service can guarantee absolute security.',
    ],
  },
  {
    title: 'Children',
    body: [
      'HealthyFlow is not directed to children under 13, and we do not knowingly collect personal information from children under 13.',
    ],
  },
  {
    title: 'Changes',
    body: [
      'We may update this Privacy Policy from time to time. The updated version will be posted here with a new effective date.',
    ],
  },
]

export default function PrivacyPolicyPage() {
  return (
    <div className="native-legal-page min-h-screen bg-page px-4 py-10 text-ink-soft sm:px-6 lg:px-8">
      <main className="mx-auto max-w-4xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Link to="/" className="text-sm font-medium text-accent transition-colors hover:text-accent">
            HealthyFlow
          </Link>
          <Link to="/terms" className="text-sm font-medium text-ink-muted transition-colors hover:text-ink-soft">
            Terms of Service
          </Link>
        </div>

        <article className="rounded-2xl border border-line/50 bg-card/60 p-6 shadow-xl shadow-accent/5 sm:p-8">
          <p className="mb-3 text-sm font-medium uppercase tracking-wider text-accent">Effective October 20, 2026</p>
          <h1 className="mb-4 text-3xl font-bold text-ink sm:text-4xl">Privacy Policy</h1>
          <p className="mb-8 text-base leading-7 text-ink-soft">
            This Privacy Policy explains how HealthyFlow collects, uses, shares, and protects information when you use
            our day planning and health tracking app and website.
          </p>

          <div className="space-y-8">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="mb-3 text-xl font-semibold text-ink">{section.title}</h2>
                <div className="space-y-3">
                  {section.body.map((paragraph) => (
                    <p key={paragraph} className="leading-7 text-ink-soft">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}

            <section>
              <h2 className="mb-3 text-xl font-semibold text-ink">Contact</h2>
              <p className="leading-7 text-ink-soft">
                For privacy questions, requests, or concerns, contact HealthyFlow support at{' '}
                <a className="text-accent hover:text-accent-hover" href="mailto:support@healthyflow.app">
                  support@healthyflow.app
                </a>
                .
              </p>
            </section>
          </div>
        </article>
      </main>
    </div>
  )
}
