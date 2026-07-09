import { Link } from 'react-router-dom'

const sections = [
  {
    title: 'Using HealthyFlow',
    body: [
      'You may use HealthyFlow only if you can form a binding agreement and comply with these Terms and applicable law.',
      'You are responsible for keeping your account credentials secure and for all activity that occurs through your account.',
    ],
  },
  {
    title: 'Your content',
    body: [
      'You keep ownership of the items, notes, schedules, calorie entries, workout data, and other content you add to HealthyFlow.',
      'You grant HealthyFlow a limited license to host, process, transmit, display, and back up your content only as needed to provide, secure, maintain, and improve the service.',
    ],
  },
  {
    title: 'AI features',
    body: [
      'HealthyFlow includes AI-powered features that may parse text, suggest items, answer questions, or estimate information based on your inputs.',
      'AI output may be wrong, incomplete, or unsuitable for your situation. You must review output before using it, and you should not rely on HealthyFlow for medical, nutritional, legal, financial, or emergency decisions.',
    ],
  },
  {
    title: 'Acceptable use',
    body: [
      'You agree not to misuse the service, attempt unauthorized access, interfere with service operation, scrape or reverse engineer the service, upload malicious code, or use HealthyFlow to violate the rights of others.',
      'We may suspend or terminate access if we believe your use creates risk, violates these Terms, or may harm HealthyFlow, other users, or third parties.',
    ],
  },
  {
    title: 'Subscriptions and paid features',
    body: [
      'Some features may require payment, usage credits, or a subscription. Prices, feature availability, and limits may change over time.',
      'Unless stated otherwise at purchase, fees are non-refundable except where required by law.',
    ],
  },
  {
    title: 'Service changes',
    body: [
      'We may add, change, suspend, or discontinue features at any time. We aim to preserve your data and provide reasonable notice when changes materially affect your use of the service.',
    ],
  },
  {
    title: 'Disclaimers',
    body: [
      'HealthyFlow is provided as is and as available. To the fullest extent permitted by law, we disclaim warranties of merchantability, fitness for a particular purpose, and non-infringement.',
      'HealthyFlow is a productivity tool. It is not a healthcare provider, dietitian, trainer, financial advisor, legal advisor, or emergency service.',
    ],
  },
  {
    title: 'Limitation of liability',
    body: [
      'To the fullest extent permitted by law, HealthyFlow will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, revenues, data, goodwill, or business opportunities.',
    ],
  },
  {
    title: 'Changes to these Terms',
    body: [
      'We may update these Terms from time to time. The updated version will be posted here with a new effective date. Continued use of HealthyFlow after changes means you accept the updated Terms.',
    ],
  },
]

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-page px-4 py-10 text-ink-soft sm:px-6 lg:px-8">
      <main className="mx-auto max-w-4xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Link to="/" className="text-sm font-medium text-cyan-400 transition-colors hover:text-cyan-300">
            HealthyFlow
          </Link>
          <Link to="/privacy" className="text-sm font-medium text-ink-muted transition-colors hover:text-ink-soft">
            Privacy Policy
          </Link>
        </div>

        <article className="rounded-2xl border border-line/50 bg-card/60 p-6 shadow-xl shadow-cyan-500/5 sm:p-8">
          <p className="mb-3 text-sm font-medium uppercase tracking-wider text-cyan-400">Effective July 2, 2026</p>
          <h1 className="mb-4 text-3xl font-bold text-ink sm:text-4xl">Terms of Service</h1>
          <p className="mb-8 text-base leading-7 text-ink-soft">
            These Terms of Service govern your access to and use of HealthyFlow. By creating an account or using the
            service, you agree to these Terms.
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
                Questions about these Terms can be sent to{' '}
                <a className="text-cyan-400 hover:text-cyan-300" href="mailto:support@healthyflow.app">
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
