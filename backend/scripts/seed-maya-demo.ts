import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: path.join(__dirname, '../../.env') })

import { seedMayaDemo } from '../src/demo-personas'

seedMayaDemo()
  .then(({ user, today }) => {
    console.log(`Maya demo refreshed for ${today}: ${user.email}`)
    process.exit(0)
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })

