# hinachti.gitlab.io

The public download page for **הנחתי**: <https://hinachti.gitlab.io/>

It carries no personal details. The only credit is "Created by Y.a.M", and
commits here use the neutral identity `Hinachti <noreply@hinachti.gitlab.io>`.

| What | Where | Visibility |
| --- | --- | --- |
| App source | GitLab `yamking100/hinachti` | private |
| Apks + `latest.json` the app polls | GitLab `yamking100/hinachti-releases` | **public** (installed apps read it) |
| This site | GitLab `hinachti/hinachti.gitlab.io` | project **private**, Pages **Everyone** |

**The releases project never moves.** Every installed copy of the app checks
`https://gitlab.com/yamking100/hinachti-releases/-/raw/main/latest.json`. Renaming
or transferring that project breaks the update check for everyone already on the
apk channel, which is why the site is a separate project that copies from it.

## Publishing

Release the app first (in the app repo), so `../hinachti-releases/latest.json`
and the apk are current. Then:

```powershell
.\tools\publish.ps1
```

It renders `public/`, commits, pushes, starts the Pages runner for one job, and
waits until <https://hinachti.gitlab.io/latest.json> reports the new version.
For a change to the page itself rather than a new app version, pass a message:
`.\tools\publish.ps1 -Message "FAQ update"`.

### The runner

GitLab's own CI runners need an identity-verified account, so instance runners
are off for this project and a private project runner does the job: name
"Hinachti site", tag `hinachti-pages`, shell executor, Windows PowerShell. It is
**not** installed as a service; `publish.ps1` starts
`%USERPROFILE%\.gitlab-runner\gitlab-runner.exe` for one job and stops it.
`config.toml` next to it holds the runner token and must never be committed.

Registering it once (token from Settings → CI/CD → Runners in the project):

```powershell
cd $env:USERPROFILE\.gitlab-runner
.\gitlab-runner.exe register --url https://gitlab.com/ --token <TOKEN> `
  --executor shell --shell powershell --name "Hinachti site"
```

## What is in here

| Path | |
| --- | --- |
| `templates/index.html` | the page, with `{{PLACEHOLDERS}}` |
| `templates/privacy.html` | the privacy policy page |
| `tools/build.py` | fills the placeholders from `latest.json`, copies the apk, writes `robots.txt` and `sitemap.xml` |
| `tools/make-assets.py` | fonts, icons, screenshots and the link preview image, from the app's own files. Run again only when the app's look changes |
| `tools/publish.ps1` | render, commit, push, run the Pages job |
| `public/` | exactly what GitLab Pages serves. Generated, and committed |

The page loads nothing from anywhere else: the two fonts are the app's own
(Heebo and Frank Ruhl Libre, SIL OFL, licences in `public/fonts/`), subsetted to
Hebrew and converted to woff2. No analytics, no cookies, no third-party requests.

## Editing the page

Change `templates/`, or the FAQ and screenshot captions in `tools/build.py`,
then `python tools/build.py` and open `public/index.html`. To see it as a
browser does, serve it rather than opening the file, so the absolute paths work:

```powershell
python -m http.server 8099 --directory public
```

## Still to fill in

`TESTER_GROUP_URL` and `TESTER_OPTIN_URL` in `tools/build.py`. While they are
empty the "help it reach the store" section explains itself without dead links;
fill both in when the closed test opens and the two buttons appear.
