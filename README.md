# The Girl in the Library

A password-unlocked, static Astro reading room for GitHub Pages.

Published at: <https://yuliyulidaz.github.io/lalanote/>

## First local test

```powershell
npm install
$env:LIBRARY_PASSWORD = "choose-a-test-password"
npm run encrypt
Remove-Item Env:LIBRARY_PASSWORD
npm run dev
```

Open the local address shown in the terminal. The password is never written into the website source. When running `npm run encrypt` without the environment variable, the script asks for the password without displaying it.

## Add chapters

Put Markdown files in `private-content/`, using names such as `chapter-01.md`, `chapter-02.md`, and so on. This entire directory is ignored by Git. Re-run `npm run encrypt` whenever the manuscript changes, then commit only the new encrypted file in `public/encrypted/library.json`.

## Important security boundary

The deployed site contains ciphertext, not plaintext or the password. This prevents casual reading through page source or developer tools. It is still a static client-side system: anyone who knows the password can decrypt and copy the text, and a weak password can be guessed offline. Use a long, unique password.
