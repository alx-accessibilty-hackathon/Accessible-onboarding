# Savanna demo pages (FB-10)

Copy the pages and assets you need from the Savanna starter
(https://github.com/alx-africa/Savanna-static-pages) into this folder, then add the widget:

- a sign-up page with `<bridge-onboarding flow="signup">`
- a "Complete your profile" card on the learner homepage
- a jobs page with `<bridge-onboarding flow="jobs">`

Load it with `<script type="module" src="/src/widget/element.tsx"></script>` in development,
and add each page to `build.rollupOptions.input` in `vite.config.ts`.
