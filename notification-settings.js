document.addEventListener('DOMContentLoaded', async () => {

  if (!requireLogin()) return;

  // Real browser history, not a plain static link - a plain <a
  // href="settings.html"> always pushed a BRAND NEW history entry even
  // when the person arrived FROM settings.html, so Back on the page
  // after that just bounced back here again - an actual infinite
  // back/forward loop between the two screens. Same pattern every other
  // back button in this app already uses.
  document.getElementById('back-btn').addEventListener('click', (event) => {
    if (window.history.length > 1) {
      event.preventDefault();
      window.history.back();
    }
  });

  const pushToggle = document.getElementById('toggle-push');
  const pushStatus = document.getElementById('push-status');
  const categoryGroup = document.getElementById('category-group');
  const categoryToggles = [...document.querySelectorAll('.category-toggle')];

  function setStatus(text, kind) {
    pushStatus.textContent = text;
    pushStatus.className = 'notif-status' + (kind ? ' ' + kind : '');
  }

  function setCategoriesEnabled(enabled) {
    categoryGroup.classList.toggle('disabled', !enabled);
  }

  // ---------------------------------------------------------------
  // Load real saved category preferences - a category never saved yet
  // (nobody's touched this screen before) defaults to ON, matching the
  // backend's own "missing = on" rule (see User.notification_prefs).
  // ---------------------------------------------------------------
  apiFetch('/notifications/preferences')
    .then((data) => {
      categoryToggles.forEach((toggle) => {
        const category = toggle.dataset.category;
        toggle.checked = data.preferences[category] !== false;
      });
    })
    .catch(() => {}); // decorative fallback - toggles just keep their default-checked state

  // ---------------------------------------------------------------
  // Real phone-notification state - reflects what the BROWSER actually
  // has right now, not just a locally-remembered guess (permission can
  // be revoked outside the app entirely, with no event to tell us).
  // ---------------------------------------------------------------
  if (!isPushSupported()) {
    pushToggle.disabled = true;
    setStatus("This browser doesn't support phone notifications.", 'error');
    setCategoriesEnabled(false);
  } else if (pushPermissionState() === 'denied') {
    pushToggle.disabled = true;
    setStatus('Blocked in your browser/phone settings - allow notifications there first.', 'error');
    setCategoriesEnabled(false);
  } else {
    const active = await isPushActive();
    pushToggle.checked = active;
    setCategoriesEnabled(active);
    setStatus(active ? "You'll get real notifications on this device." : 'Off - turn on to get real notifications on this device.');
  }

  pushToggle.addEventListener('change', async (event) => {
    const wantsOn = event.target.checked;
    pushToggle.disabled = true;
    setStatus(wantsOn ? 'Turning on...' : 'Turning off...');

    try {
      if (wantsOn) {
        await enablePushNotifications();
        setStatus("You'll get real notifications on this device.", 'success');
      } else {
        await disablePushNotifications();
        setStatus('Off - turn on to get real notifications on this device.');
      }
      setCategoriesEnabled(wantsOn);
    } catch (error) {
      event.target.checked = !wantsOn; // revert - it didn't actually change
      setStatus(error.message, 'error');
    } finally {
      pushToggle.disabled = false;
    }
  });

  // ---------------------------------------------------------------
  // Each category toggle saves itself the moment it's flipped - no
  // separate "Save" button, same instant-save pattern as every other
  // toggle in Settings.
  // ---------------------------------------------------------------
  categoryToggles.forEach((toggle) => {
    toggle.addEventListener('change', () => {
      const category = toggle.dataset.category;
      apiFetch('/notifications/preferences', {
        method: 'PUT',
        body: JSON.stringify({ preferences: { [category]: toggle.checked } }),
      }).catch((error) => {
        toggle.checked = !toggle.checked; // revert - the save didn't actually happen
        alert("Couldn't save that: " + error.message);
      });
    });
  });

});
