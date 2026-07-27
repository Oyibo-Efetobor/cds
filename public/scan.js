const statusMessage = document.getElementById('statusMessage');
const fullNameInput = document.getElementById('fullName');
const stateCodeInput = document.getElementById('stateCode');
const phoneInput = document.getElementById('phone');
const submitButton = document.getElementById('submitAttendance');
const validationOverlay = document.getElementById('validationOverlay');
const validationIcon = document.getElementById('validationIcon');
const validationTitle = document.getElementById('validationTitle');
const validationDetail = document.getElementById('validationDetail');

const showMessage = (text, isError = false) => {
  if (!statusMessage) return;
  statusMessage.style.display = 'block';
  statusMessage.textContent = text;
  statusMessage.classList.remove('error', 'success');
  statusMessage.classList.add(isError ? 'error' : 'success');
};

const hideMessage = () => {
  if (!statusMessage) return;
  statusMessage.style.display = 'none';
};

const parseSessionToken = (token) => token;

const setValidationStatus = (message, state = 'loading', detail = '') => {
  if (!validationOverlay || !validationIcon || !validationTitle || !validationDetail) return;
  validationOverlay.style.display = 'flex';
  document.body.classList.add('blurred');

  const iconState = state === 'success' ? 'success' : state === 'error' ? 'error' : 'loading';
  validationIcon.className = `validation-icon ${iconState}`;
  validationIcon.innerHTML = state === 'success' || state === 'error'
    ? '<span class="status-mark"></span>'
    : '<span class="loader-ring"></span><span class="loader-core"></span>';
  validationTitle.textContent = message;
  validationDetail.textContent = detail || '';
};

const clearValidationOverlay = () => {
  if (!validationOverlay) return;
  validationOverlay.style.display = 'none';
  document.body.classList.remove('blurred');
};

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const submitAttendance = async () => {
  const token = sessionToken;
  const fullName = fullNameInput.value.trim();
  const stateCode = stateCodeInput.value.trim();
  const phone = phoneInput.value.trim();

  if (!token || !fullName || !stateCode || !phone) {
    showMessage('Please fill all fields.', true);
    return;
  }

  hideMessage();
  setValidationStatus('Checking your location...', 'loading', 'Verifying that you are within the event radius.');

  if (!navigator.geolocation) {
    setValidationStatus('Location access is not supported by this browser.', 'error');
    showMessage('Geolocation is not supported by this browser.', true);
    return;
  }

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
    });

    setValidationStatus('Checking whether this device has already checked in...', 'loading', 'We are verifying that this device has not already been used for this session.');
    await sleep(600);

    const response = await fetch('/api/submit-attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        full_name: fullName,
        state_code: stateCode,
        phone,
        lat: position.coords.latitude,
        long: position.coords.longitude,
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Unable to submit attendance');
    }

    const isApproved = result.status === 'verified';
    if (isApproved) {
      setValidationStatus('Check-in approved', 'success', result.message || 'Your attendance has been recorded successfully.');
      showMessage(`${result.status.toUpperCase()}: ${result.message}`);
      window.setTimeout(clearValidationOverlay, 2400);
    } else {
      setValidationStatus('Check-in denied', 'error', result.message || 'This device has already been used.');
      showMessage(`${result.status.toUpperCase()}: ${result.message}`, true);
      window.setTimeout(clearValidationOverlay, 2400);
    }
  } catch (error) {
    setValidationStatus('Check-in denied', 'error', error.message || 'Please try again or contact the event organizer.');
    showMessage(error.message || 'Unable to submit attendance', true);
    window.setTimeout(clearValidationOverlay, 2400);
  }
};

submitButton.addEventListener('click', submitAttendance);

const params = new URLSearchParams(window.location.search);
const sessionId = params.get('sessionId');
const sessionToken = sessionId || '';
if (sessionId) {
  showMessage('Loaded session from link.');
} else {
  showMessage('No session found. Scan a valid QR code.', true);
}
