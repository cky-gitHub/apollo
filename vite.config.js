import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Mounted at ckyogeshwar.com/apollo: the homepage repo copies dist/ into its
// public/apollo. `base` makes every built asset URL and import.meta.env.BASE_URL
// carry the /apollo/ prefix; the router and the model/texture paths read it.
export default defineConfig({
  base: '/apollo/',
  plugins: [react()],
})
