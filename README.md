# Live Underground

A live map of London Underground / DLR / Elizabeth line trains, built on the TfL Unified API.

## Project layout

- `/` — the React (Create React App) frontend.
- `/server` — the Flask backend (`arrivals.py`) that proxies and aggregates TfL arrivals data.

Both are deployed together as one Vercel project using [Vercel Services](https://vercel.com/docs/services): the frontend is served at `/`, and requests to `/tfl/*` are routed to the Flask backend (see `vercel.json`).

## Backend setup

The backend calls the TfL Unified API and needs an API key from [api-portal.tfl.gov.uk](https://api-portal.tfl.gov.uk/).

1. Copy `server/.env.example` to `server/.env` and fill in `TFL_APP_KEY`.
2. In the Vercel project's Environment Variables settings, add `TFL_APP_KEY` with the same value.

## Local development

Run the backend:

```bash
cd server
pip install -r requirements.txt
python arrivals.py   # serves http://localhost:5000
```

In another terminal, run the frontend (proxies `/tfl/*` requests to `http://localhost:5000`, see the `proxy` field in `package.json`):

```bash
yarn install
yarn start   # serves http://localhost:3000
```

Alternatively, `vercel dev` runs both services together the same way they run in production.

## Deploying

Push to the connected Git repository, or run `vercel deploy`. Vercel builds the frontend and backend as separate services from the same project and wires them together per `vercel.json`.

---

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `yarn start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `yarn test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `yarn build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `yarn eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `yarn build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
