const fullNameInput = document.getElementById('fullName');
const stateCodeInput = document.getElementById('stateCode');
const scanSubmitButton = document.getElementById('scanSubmit');
const stopScanButton = document.getElementById('stopScan');
const scannerContainer = document.getElementById('scannerContainer');
const qrScanner = document.getElementById('qrScanner');
const statusMessage = document.getElementById('statusMessage');

let html5QrCode = null;

const showMessage = (text, isError = false) => {
  if (!statusMessage) return;
  statusMessage.style.display = 'block';
  statusMessage.textContent = text;
  statusMessage.style.backgroundColor = isError ? '#fee2e2' : '#ecfdf5';
  statusMessage.style.color = isError ? '#991b1b' : '#166534';
};

const hideMessage = () => {
  if (!statusMessage) return;
  statusMessage.style.display = 'none';
};

const startScanner = () => {
  if (!qrScanner || !scannerContainer) return;

  if (!fullNameInput.value.trim() || !stateCodeInput.value.trim()) {
    showMessage('Please fill your name and state code first.', true);
    return;
  }

  if (!window.Html5Qrcode) {
    showMessage('QR scanner library not loaded.', true);
    return;
  }

  hideMessage();
  scannerContainer.style.display = 'block';
  html5QrCode = new Html5Qrcode('qrScanner');

  html5QrCode.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: 250 },
    (decodedText) => {
      stopScanner();
      submitAttendance(decodedText);
    },
    () => {
      // ignore intermediate scan errors
    }
  ).catch((err) => {
    showMessage('Unable to start camera: ' + err, true);
    scannerContainer.style.display = 'none';
  });
};

const stopScanner = () => {
  if (!html5QrCode) {
    if (scannerContainer) scannerContainer.style.display = 'none';
    return;
  }

  html5QrCode.stop().then(() => {
    scannerContainer.style.display = 'none';
    html5QrCode.clear();
    html5QrCode = null;
  }).catch(() => {
    scannerContainer.style.display = 'none';
    html5QrCode = null;
  });
};

const submitAttendance = (token) => {
  const fullName = fullNameInput.value.trim();
  const stateCode = stateCodeInput.value.trim();

  if (!token) {
    showMessage('QR code data is missing.', true);
    return;
  }

  if (!fullName || !stateCode) {
    showMessage('Please fill your name and state code before scanning.', true);
    return;
  }

  if (!navigator.geolocation) {
    showMessage('Geolocation is not supported by this browser.', true);
    return;
  }

  showMessage('Scanning complete. Submitting attendance...');

  navigator.geolocation.getCurrentPosition(async (position) => {
    try {
      const response = await fetch('/api/submit-attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          full_name: fullName,
          state_code: stateCode,
          lat: position.coords.latitude,
          long: position.coords.longitude,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Unable to submit attendance');
      }

      showMessage(`${result.status.toUpperCase()}: ${result.message}`);
    } catch (error) {
      showMessage(error.message || 'Unable to submit attendance', true);
    }
  }, () => {
    showMessage('Location permission denied or unavailable.', true);
  });
};

scanSubmitButton?.addEventListener('click', startScanner);
stopScanButton?.addEventListener('click', stopScanner);
