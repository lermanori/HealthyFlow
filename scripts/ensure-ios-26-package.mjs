import fs from 'node:fs'

const packagePath = 'ios/App/CapApp-SPM/Package.swift'
const source = fs.readFileSync(packagePath, 'utf8')

if (!source.includes('platforms: [.iOS(.v26)]')) {
  throw new Error('Capacitor did not generate the expected iOS 26 Swift package.')
}

const updated = source.replace(
  /^\/\/ swift-tools-version: .*$/m,
  '// swift-tools-version: 6.2',
)

if (!updated.startsWith('// swift-tools-version: 6.2')) {
  throw new Error('Could not set the Swift package tools version required by iOS 26.')
}

if (updated !== source) fs.writeFileSync(packagePath, updated)
