# Creche website

A simple public website that shows:
- whether applications are **open or closed**
- how many **spaces** are free in each age group
- an **application form** (only shown when applications are open)

Staff use `/admin.html` to open or close applications, update spaces, and see applications.

## Files

```
creche-site/
  server.js          backend (Express)
  package.json
  public/
    index.html       public page
    admin.html       staff page
```

## Run it on your computer

```
npm install
ADMIN_PASSWORD=pick-a-strong-password npm start
```

On Windows (PowerShell):

```
npm install
$env:ADMIN_PASSWORD="pick-a-strong-password"; npm start
```

Then open http://localhost:3000 (public) and http://localhost:3000/admin.html (staff).

## Put it online (Render)

1. Push this folder to a GitHub repository.
2. On Render, create a new **Web Service** from the repository.
3. Build command: `npm install`  Start command: `npm start`
4. Under **Environment**, add `ADMIN_PASSWORD` with a strong password.
5. Deploy. Your public link is the URL Render gives you.

## Important: keeping the data

Spaces and applications are saved in `data.json` on the server.

- On Render's free plan the disk is wiped on every redeploy and restart, so **data will be lost**.
- To keep it, add a Render **Persistent Disk** and set the environment variable `DATA_FILE` to a path on that disk, for example `/var/data/data.json`.
- Or ask me to switch the storage to a free hosted database.

## Privacy

Applications contain children's details. Use a strong admin password, serve the site over HTTPS (Render does this by default), and delete old applications you no longer need.
