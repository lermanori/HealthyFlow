import { Link } from 'react-router-dom'

const sections = [
  {
    title: 'Information we collect',
    body: [
      'Account information: your name, email address, password hash, and authentication data used to keep your account secure.',
      'Product information: items you create in HealthyFlow, including tasks, habits, schedules, completions, calorie entries, workouts, settings, and related notes you choose to enter.',
      'AI input and output: text you submit to AI-powered features and the structured results or assistant responses generated from that text.',
      'Technical information: basic device, browser, log, error, and usage information needed to operate, secure, improve, and debug the service.',
    ],
  },
  {
    title: 'How we use information',
    body: [
      'We use your information to provide HealthyFlow, save and sync your items, personalize your experience, operate AI features, troubleshoot issues, prevent abuse, and communicate service-related updates.',
      'HealthyFlow uses a server-keyed OpenAI integration. Your OpenAI API key is not requested or stored by the client.',
    ],
  },
  {
    title: 'AI processing',
    body: [
      'When you use AI features, the content you submit may be sent to OpenAI so the requested feature can run. Do not submit sensitive information you do not want processed by an AI provider.',
      'AI results can be incomplete or inaccurate. You are responsible for reviewing generated items, suggestions, nutrition estimates, or recommendations before relying on them.',
    ],
  },
  {
    title: 'How we share information',
    body: [
      'We do not sell your personal information. We share information with service providers only as needed to run HealthyFlow, including hosting, database, authentication, analytics, error monitoring, and AI processing providers.',
      'We may disclose information if required by law, to protect rights and safety, or in connection with a merger, acquisition, financing, or sale of assets.',
    ],
  },
  {
    title: 'Data retention and deletion',
    body: [
      'We keep account and product data for as long as your account is active or as needed to provide the service, comply with law, resolve disputes, and enforce agreements.',
      'You may request account deletion or data export by contacting us. We may retain backups or logs for a limited period where technically or legally necessary.',
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
    <div className="min-h-screen bg-gray-900 px-4 py-10 text-gray-200 sm:px-6 lg:px-8">
      <main className="mx-auto max-w-4xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Link to="/" className="text-sm font-medium text-cyan-400 transition-colors hover:text-cyan-300">
            HealthyFlow
          </Link>
          <Link to="/terms" className="text-sm font-medium text-gray-400 transition-colors hover:text-gray-200">
            Terms of Service
          </Link>
        </div>

        <article className="rounded-2xl border border-gray-700/50 bg-gray-800/60 p-6 shadow-xl shadow-cyan-500/5 sm:p-8">
          <p className="mb-3 text-sm font-medium uppercase tracking-wider text-cyan-400">Effective July 2, 2026</p>
          <h1 className="mb-4 text-3xl font-bold text-gray-100 sm:text-4xl">Privacy Policy</h1>
          <p className="mb-8 text-base leading-7 text-gray-300">
            This Privacy Policy explains how HealthyFlow collects, uses, shares, and protects information when you use
            our personal productivity and habit tracking service.
          </p>

          <div className="space-y-8">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="mb-3 text-xl font-semibold text-gray-100">{section.title}</h2>
                <div className="space-y-3">
                  {section.body.map((paragraph) => (
                    <p key={paragraph} className="leading-7 text-gray-300">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}

            <section>
              <h2 className="mb-3 text-xl font-semibold text-gray-100">Contact</h2>
              <p className="leading-7 text-gray-300">
                For privacy questions, requests, or concerns, contact HealthyFlow support at{' '}
                <a className="text-cyan-400 hover:text-cyan-300" href="mailto:privacy@healthyflow.app">
                  privacy@healthyflow.app
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
