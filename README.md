# 90D Fit Journal

A responsive, beginner-friendly fitness dashboard for a 90-day strength and habit plan.

## Features

- Dashboard with your current programme day, phase, starting calorie/protein estimates, and next planned session.
- Foundation workouts (Full Body A/B) and later Upper/Lower workouts.
- Workout logging by exercise, including working load, reps, and session notes.
- Affordable Indian meal template with rough calorie/protein estimates and budget substitutions.
- Daily habit check-in for training/recovery, protein, water, sleep, learning, and logging.
- Body-weight/waist measurement log with a simple SVG weight-trend chart.
- Weekly workout history and progress reminders.
- Editable profile and targets.
- JSON backup export and restore.
- Responsive layout for desktop and mobile.
- No frameworks or package installation required.

## Run it in VS Code

1. Extract `fit90-website.zip` to a folder on your computer.
2. Open VS Code.
3. Choose **File → Open Folder...** and select the extracted `fit90-website` folder.
4. In the VS Code Extensions panel, install **Live Server** (the extension by Ritwick Dey is a common option).
5. Open `index.html`, then click **Go Live** in the VS Code status bar, or right-click `index.html` and choose **Open with Live Server**.
6. Your browser should open the website. Keep the local server running while you use it.

This project is plain HTML, CSS, and JavaScript. No `npm install`, build step, API key, or backend is required. You can also open `index.html` directly in a browser, but a local server is more reliable for browser storage and development.

## Project files

- `index.html` — page structure and the different app screens.
- `styles.css` — layout, responsive styling, colours, and components.
- `app.js` — navigation, workout and habit logs, progress chart, settings, and browser storage.

## Important: where your data is stored

The app saves data in the browser's `localStorage` on the device where you use it. It does not create an online account or sync data between devices. Clearing site/browser data can erase saved entries, so use **My settings → Export backup** periodically. The JSON restore function replaces the current locally saved data, so export your existing data before importing if you want to keep both.

## Personalisation

The initial targets are set to 2,400 kcal and 115 g protein as provisional starting estimates for the profile supplied by the user. They are editable under **My settings**. Calorie needs should be reviewed against multiple weeks of weight, waist, nutrition, and recovery trends rather than one day's result.

## Health note

This is an educational fitness tracker, not medical advice or a diagnostic tool. It includes a reminder to have persistent chest enlargement described as gynecomastia assessed by a qualified clinician. Stop exercise for sharp/joint pain, dizziness, chest pain, or unusual symptoms and seek appropriate medical advice; severe symptoms may need urgent care.

## Troubleshooting

- If the page looks unstyled, check that `styles.css` is in the same folder as `index.html`.
- If controls do not respond, check that `app.js` is in the same folder and inspect **Developer Tools → Console** for errors.
- If data appears missing, make sure you are using the same browser and the same local address/port as before. Different browser profiles and different Live Server ports may use separate local storage.
- Export a JSON backup before resetting or importing data.
