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

## Add books and chapters

Give every novel its own folder inside `private-content/`. Each folder contains a private `book.json` and its Markdown chapters:

```text
private-content/
  01-the-girl-in-the-library/
    book.json
    readers.json
    chapter-01.md
    chapter-01.comments.json
    chapter-02.md
    chapter-02.comments.json
  02-another-novel/
    book.json
    chapter-01.md
```

The folder prefix controls shelf order. `book.json` stores the title, description, cover color, and cover symbol. `readers.json` defines the novel's recurring fictional reader profiles, including their permanent badge symbol and color. Each optional `chapter-NN.comments.json` file contains that chapter's comments, replies, likes, posting labels, and translations.

The entire `private-content/` directory is ignored by Git. Re-run `npm run encrypt` whenever a manuscript or its reader reactions change, then commit only the encrypted `public/encrypted/library.json` file. The comments are encrypted together with the chapter text.

The reader remembers only the last book and chapter opened in that browser. It does not track completion or reading progress.

## Important security boundary

The deployed site contains ciphertext, not plaintext or the password. This prevents casual reading through page source or developer tools. It is still a static client-side system: anyone who knows the password can decrypt and copy the text, and a weak password can be guessed offline. Use a long, unique password.
