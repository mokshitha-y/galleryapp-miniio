# Push this repo to GitHub

The repo is already initialised with an initial commit on branch `main`. Follow these steps to push to GitHub.

## 1. Create a new repository on GitHub

- Go to [github.com/new](https://github.com/new).
- **Repository name:** e.g. `gallery-miniio`.
- Leave **empty** (no README, no .gitignore, no license).
- Create the repository.

## 2. Add the remote and push

Replace `YOUR_USERNAME` with your GitHub username (and change repo name if you used something other than `gallery-miniio`).

```bash
cd /Users/mokshithayeruva/gallery-miniio

# Add your GitHub repo as origin
git remote add origin https://github.com/YOUR_USERNAME/gallery-miniio.git

# Push main branch and set upstream
git push -u origin main
```

If you use SSH:

```bash
git remote add origin git@github.com:YOUR_USERNAME/gallery-miniio.git
git push -u origin main
```

## 3. Done

After the first push, use `git push` for future updates.
