# Deploying the demo (owner steps)

The demo runs on Cloudflare Pages. Its data sits in a private R2 bucket, and Cloudflare Access lets only the people you invite open it ([ADR 0015](adr/0015-demo-hosting-cloudflare.md)). The code side is done. The steps below need your Cloudflare login, so only you can do them. Everything fits the free plans.

Never paste a token or key into a file in this repository or into a chat. Tokens go only into rclone's config, the wrangler login and GitHub's secret settings, as described below.

## 0. What you need

- A Cloudflare account (free): https://dash.cloudflare.com/sign-up
- The tiles and data built locally (README "Run it", steps 2 and 3):
  - the 13 % sample tiles in `data/potree/nora-random13/`, from `export_las.py --sample 0.13` and `build_potree.sh ... data/potree/nora-random13`;
  - `data/scan.json`, `data/instances.json` and `data/issues.json`.
- rclone:
  ```bash
  brew install rclone
  ```

## 1. Create the R2 bucket

1. In the Cloudflare dashboard, open **R2 object storage**. The first time, it asks you to enable R2 and enter a payment method. The free tier (10 GB storage, free egress) covers this demo, which uses about 0.4 GB.
2. Click **Create bucket** and name it `scan-inventory-demo` (the name in `web/wrangler.toml`).
3. Leave **Public access** off. The bucket stays private, and the site reads it through its Function.

## 2. Create an R2 API token for uploading

1. Go to **R2 object storage** > **Overview** > **API Tokens: Manage** (under Account Details) > **Create Account API token**.
2. Set the permission to **Object Read & Write**, and limit it to the bucket `scan-inventory-demo`.
3. Copy the **Access Key ID**, the **Secret Access Key** and your **Account ID** (shown on the R2 overview page). The secret is shown only once.

## 3. Configure rclone

```bash
rclone config
```

Create a new remote named `r2` with these settings:
- storage `s3`
- provider `Cloudflare`
- the Access Key ID and the Secret Access Key from step 2
- endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
- acl `private`

Then check it with `rclone lsd r2:` (it should list `scan-inventory-demo`). rclone keeps the keys in `~/.config/rclone/rclone.conf`, outside the repo.

## 4. Upload the data

```bash
scripts/deploy/upload_demo_data.sh --dry-run   # shows what would be copied
scripts/deploy/upload_demo_data.sh
```

This uploads about 400 MB under `v1/`: `v1/potree/nora/` (metadata, hierarchy, octree), `v1/data/` (the three JSON files), and `v1/media/demo.webm` if you recorded the video (step 7). The 395 MB `octree.bin` goes up in 100 MB parts.

## 5. Create the Pages project and deploy once

```bash
cd web
npx wrangler login                     # opens the browser: log in to Cloudflare there
npx wrangler pages project create scan-inventory --production-branch=main
pnpm build:demo
npx wrangler pages deploy dist --project-name=scan-inventory --branch=main
```

`wrangler pages deploy` reads `web/wrangler.toml` and binds the bucket to the Function as `DEMO_DATA`. It prints the address, `https://scan-inventory.pages.dev` (if the name is taken, Cloudflare adds a suffix).

Check it: open the address, and in DevTools > Network, filter for `octree.bin`. The requests should show status **206**. If they show 404, the upload (step 4) or the bucket name is wrong.

## 6. Let GitHub deploy on every push to main

1. Create an API token at **My Profile** > **API Tokens** > **Create Token** > **Custom token**:
   - permission **Account** > **Cloudflare Pages** > **Edit**;
   - if the deploy fails with a permission error about R2, also add **Account** > **Workers R2 Storage** > **Read**.
2. In GitHub, add two secrets to `shueny/scan-inventory` under **Settings** > **Secrets and variables** > **Actions** > **New repository secret**:
   - `CLOUDFLARE_API_TOKEN`: the token from step 1.
   - `CLOUDFLARE_ACCOUNT_ID`: your Account ID.
3. The **Deploy demo** workflow runs on the next push to `main`. You can also start it by hand under **Actions** > **Deploy demo** > **Run workflow**. Until the secrets exist, it skips the deploy and stays green.

## 7. Record the demo video (optional, before step 4)

```bash
pnpm --dir web dev --port 5174          # static mode with the local tiles
pnpm --dir web demo:record              # in a second terminal
```

It plays the demo script in a visible browser window, then writes `data/demo/demo.webm` and the README screenshots. Upload again (step 4), then set `VITE_DEMO_VIDEO_URL=/r2/v1/media/demo.webm` in `web/.env.demo` and push. The small-screen and no-WebGL notices then link to the video.

## 8. Only invited people: Cloudflare Access

1. Open **Zero Trust** in the dashboard. The first time, choose a team name and the **Free** plan (up to 50 users).
2. Go to **Integrations** > **Identity providers** > **Add** > **One-time PIN**. Invited people then get a code by email; they need no account.
3. Go to **Workers & Pages** > `scan-inventory` > **Settings** > **General** > **Enable access policy**. This creates an Access application, but by default it only protects the *preview* addresses.
4. To protect the main address too:
   1. Go to **Zero Trust** > **Access** > **Applications**, open the application that was just created, and click **Configure**.
   2. In the public hostname, remove the `*.` wildcard from the subdomain, so it reads `scan-inventory.pages.dev`, and save.
   3. Go back to step 3 and enable the access policy again.

   You end up with two applications: `scan-inventory.pages.dev` and `*.scan-inventory.pages.dev`. Cloudflare documents this under "Known issues" > "Enable Access on your `*.pages.dev` domain".
5. In each of the two applications, edit the policy. Set **Action** to **Allow**, and in **Include** add **Emails**, then enter the addresses of the people you invite. Type the addresses into Cloudflare directly; there is no need to share them anywhere else.
6. Check it in a private browser window: opening the address asks for an email, and an invited address receives a code and gets in. Then check DevTools > Network again: `octree.bin` should still show 206.

## 9. Finish

- Add the address to the README ("Live demo"). Say there that access is by invitation.
- Before sending the link to someone, add their email to the Access policy (step 8.5).
- To make the demo public later, delete the two Access applications. Nothing in the code changes.

## Limits to keep in mind

- **Function requests:** the free plan allows 100,000 a day, and every tile read is one. A close-up view needs about 50, so this is plenty for invited reviewers.
- **R2:** 10 GB of storage and 10 million reads a month are free, and egress costs nothing.
- **New data:** upload it under `v2/` (`DATA_VERSION=v2 scripts/deploy/upload_demo_data.sh`), then set `VITE_DATA_VERSION=v2` and the `v2` paths in `web/.env.demo`. Visitors' saved review changes belong to `v1` and are not applied to the new data.
