// The Service Worker - a script the browser keeps running in the
// background, separate from any actual open tab, which is the ONLY
// thing that lets a real notification appear on the phone/lock screen
// even while StudyBuddy itself is fully closed. Must live at the SITE
// ROOT (not in a subfolder) - a service worker can only ever "see" push
// events for pages at or below the folder it's registered from, and
// StudyBuddy's pages are all at the root.

self.addEventListener('push', (event) => {
  let data = { title: 'StudyBuddy Global', body: 'You have a new notification.', url: '/home.html' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (error) {
    // A push with no/bad JSON body still deserves SOME notification
    // rather than silently doing nothing - falls back to the generic
    // text above instead.
  }

  // Without a real icon, the OS/lock screen fell back to its own generic
  // notification glyph - plain, monochrome, and with nothing to show this
  // actually came from StudyBuddy. icon-192.png is the same blue-green
  // globe logo used everywhere else in the app; badge is a smaller
  // monochrome version some OSes (mainly Android) show in the status bar
  // instead of the full icon - same file works fine for both.
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-96.png',
      data: { url: data.url },
    })
  );
});

// Clicking the notification itself (not just the browser chrome around
// it) - focuses an already-open StudyBuddy tab if there is one, rather
// than opening a duplicate, and only opens a fresh tab when none exists.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/home.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
