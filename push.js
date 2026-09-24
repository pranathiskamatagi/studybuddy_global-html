// Real phone/lock-screen push notifications - shared by the Settings
// toggle (settings.js) and the dedicated notification-settings screen.
// Needs api.js loaded first (uses apiFetch/API_BASE).

// The browser's PushManager API wants the VAPID public key as raw bytes,
// not the base64url text the backend hands back - this is the standard
// conversion every Web Push guide uses.
function _urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// The permission the BROWSER itself is tracking (separate from whether
// we actually have a live subscription saved - see isPushActive below).
function pushPermissionState() {
  return isPushSupported() ? Notification.permission : 'unsupported';
}

// Whether THIS browser currently has a real, live subscription - checked
// against the browser's own registration, not just "did the user click
// the toggle once," since permission can be revoked from outside the app
// (a browser's own site-settings page) with no way for us to be told.
async function isPushActive() {
  if (!isPushSupported()) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return false;
  const subscription = await registration.pushManager.getSubscription();
  return subscription !== null;
}

// Turns it on: registers the service worker (a no-op if already
// registered), asks the browser for permission (shows the real OS-level
// prompt), subscribes, and saves the subscription server-side so
// notifications can actually be addressed to this device later. Throws
// a plain Error with a human message on any real failure - callers show
// that directly rather than needing their own translation.
async function enablePushNotifications() {
  if (!isPushSupported()) {
    throw new Error("This browser doesn't support push notifications.");
  }

  const registration = await navigator.serviceWorker.register('/sw.js');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notifications were blocked - check your browser/phone settings to allow them.');
  }

  const { publicKey } = await apiFetch('/notifications/push/vapid-public-key');
  if (!publicKey) {
    throw new Error("Push isn't set up on the server yet.");
  }

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _urlBase64ToUint8Array(publicKey),
      });
    } catch (error) {
      // The browser's own push service (Google's, for Chrome/Edge)
      // couldn't be reached to actually register this device - a real
      // network-level failure (a VPN, a firewall, restrictive antivirus,
      // or a genuinely offline connection), not something this app's
      // code can work around. "AbortError: Registration failed - push
      // service error" is Chromium's own literal wording for exactly
      // this - translated into something a person can actually act on.
      if (error.name === 'AbortError') {
        throw new Error("Couldn't reach the push service - check your internet connection (a VPN or firewall can block this) and try again.");
      }
      throw error;
    }
  }

  const raw = subscription.toJSON();
  await apiFetch('/notifications/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint: raw.endpoint, keys: raw.keys }),
  });
}

// Turns it off: unsubscribes THIS browser (stops it from being pushed
// to at all) and tells the server so it stops trying. Other devices the
// same person is logged into are untouched - this is per-device, same
// as every real app's notification settings.
async function disablePushNotifications() {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await apiFetch('/notifications/push/unsubscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint }),
  }).catch(() => {}); // best-effort - the browser side is already off either way
}
