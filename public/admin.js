const adminMessage = document.getElementById('adminMessage');
const sessionsList = document.getElementById('sessionsList');
const attendanceList = document.getElementById('attendanceList');
const sessionInfo = document.getElementById('sessionInfo');
const scanLinkArea = document.getElementById('scanLinkArea');
const qrCanvas = document.getElementById('qrCanvas');
const copyLinkButton = document.getElementById('copyLink');
const printQrButton = document.getElementById('printQr');
const exportAttendanceButton = document.getElementById('exportAttendance');
const adminEmailInput = document.getElementById('adminEmail');
const adminPasswordInput = document.getElementById('adminPassword');
const meetingNameInput = document.getElementById('meetingName');
const meetingDateInput = document.getElementById('meetingDate');
const venueRadiusInput = document.getElementById('venueRadius');
const saveSessionButton = document.getElementById('saveSession');
const refreshSessionsButton = document.getElementById('refreshSessions');
const unlockAdminButton = document.getElementById('unlockAdmin');
const authMessage = document.getElementById('authMessage');

const adminAuthSection = document.getElementById('adminAuthSection');
const adminPanel = document.getElementById('adminPanel');

if (adminPanel) {
  adminPanel.style.display = 'none';
}
if (adminAuthSection) {
  adminAuthSection.style.display = 'block';
}

let selectedSession = null;
let adminAccessToken = null;

const apiHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${adminAccessToken ?? ''}`,
});

const showMessage = (text, isError = false) => {
  if (!adminMessage) return;
  adminMessage.style.display = 'block';
  adminMessage.textContent = text;
  adminMessage.style.backgroundColor = isError ? '#fee2e2' : '#eff6ff';
  adminMessage.style.color = isError ? '#991b1b' : '#1d4ed8';
};

const hideMessage = () => {
  if (!adminMessage) return;
  adminMessage.style.display = 'none';
};

const showAuthMessage = (text, isError = false) => {
  if (!authMessage) return;
  authMessage.style.display = 'block';
  authMessage.textContent = text;
  authMessage.style.backgroundColor = isError ? '#fee2e2' : '#eff6ff';
  authMessage.style.color = isError ? '#991b1b' : '#1d4ed8';
};

const hideAuthMessage = () => {
  if (!authMessage) return;
  authMessage.style.display = 'none';
};

const unlockAdmin = async () => {
  const email = adminEmailInput.value.trim();
  const password = adminPasswordInput.value.trim();

  if (!email || !password) {
    showAuthMessage('Enter admin email and password.', true);
    return;
  }

  hideAuthMessage();

  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error((await response.text()) || 'Unauthorized');
    }

    const data = await response.json();
    adminAccessToken = data.access_token;

    const sessions = await fetchSessions();
    if (!sessions) {
      throw new Error('Unable to load sessions after login.');
    }

    setAdminView(true);
    renderSessions(sessions);
  } catch (error) {
    showAuthMessage(error.message || 'Unable to authenticate admin.', true);
    setAdminView(false);
  }
};

const fetchSessions = async () => {
  if (!adminAccessToken) {
    throw new Error('Sign in first to load sessions.');
  }

  const response = await fetch('/api/admin/sessions', { headers: apiHeaders() });
  if (!response.ok) {
    throw new Error((await response.text()) || 'Unable to load sessions');
  }
  return response.json();
};

const renderSessions = (sessions) => {
  if (!sessionsList) return;
  if (!sessions.length) {
    sessionsList.innerHTML = '<p class="small-text">No sessions created yet.</p>';
    return;
  }

  sessionsList.innerHTML = `
    <table class="table">
      <thead>
        <tr><th>Session</th><th>Date</th><th>Link</th><th>Action</th></tr>
      </thead>
      <tbody>${sessions
        .map(
          (session) => `
          <tr>
            <td>${escapeHtml(session.meeting_name)}</td>
            <td>${escapeHtml(session.meeting_date)}</td>
            <td><code>${escapeHtml(session.id)}</code></td>
            <td><button data-id="${escapeHtml(session.id)}" class="button-secondary select-session">Select</button></td>
          </tr>
        `
        )
        .join('')}
      </tbody>
    </table>
  `;

  document.querySelectorAll('.select-session').forEach((button) => {
    button.addEventListener('click', () => {
      const sessionId = button.dataset.id;
      const session = sessions.find((item) => item.id === sessionId);
      if (session) {
        selectSession(session);
      }
    });
  });
};

const createSession = async () => {
  const meetingName = meetingNameInput.value.trim();
  const meetingDate = meetingDateInput.value;
  const radius = Number(venueRadiusInput.value.trim()) || 120;

  if (!meetingName || !meetingDate) {
    showMessage('Please fill meeting name and date.', true);
    return;
  }

  if (!adminAccessToken) {
    showMessage('Sign in first before creating a session.', true);
    return;
  }

  if (!navigator.geolocation) {
    showMessage('Geolocation is not supported by this browser.', true);
    return;
  }

  navigator.geolocation.getCurrentPosition(async (position) => {
    const payload = {
      meeting_name: meetingName,
      meeting_date: meetingDate,
      venue_lat: position.coords.latitude,
      venue_long: position.coords.longitude,
      radius_meters: radius,
    };

    try {
      hideMessage();
      const response = await fetch('/api/admin/create-session', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const result = await response.json();
      showMessage('Session created successfully.');
      const sessions = await fetchSessions();
      renderSessions(sessions);
      if (result?.id) {
        selectSession(result);
      }
    } catch (error) {
      showMessage(error.message || 'Unable to create session', true);
    }
  }, () => {
    showMessage('Unable to read location. Allow location access and try again.', true);
  });
};

const selectSession = async (session) => {
  selectedSession = session;
  if (!sessionInfo || !scanLinkArea || !qrCanvas || !attendanceList) return;

  const scanLink = `${window.location.origin}/scan?sessionId=${encodeURIComponent(session.id)}`;
  scanLinkArea.innerHTML = `<strong>Scan link:</strong> <a href="${scanLink}" target="_blank">${scanLink}</a>`;
  await QRCode.toCanvas(qrCanvas, scanLink, { width: 260 });
  sessionInfo.style.display = 'block';
  renderAttendance(session.id);
};

const renderAttendance = async (sessionId) => {
  if (!attendanceList) return;
  attendanceList.innerHTML = '<p class="small-text">Loading attendance...</p>';

  try {
    const response = await fetch(`/api/admin/session/${encodeURIComponent(sessionId)}/attendance`, { headers: apiHeaders() });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const attendance = await response.json();
    if (!attendance.length) {
      attendanceList.innerHTML = '<p class="small-text">No attendance records for this session yet.</p>';
      return;
    }

    attendanceList.innerHTML = `
      <table class="table">
        <thead>
          <tr><th>Name</th><th>State</th><th>Phone</th><th>Time</th><th>Distance</th><th>Status</th></tr>
        </thead>
        <tbody>${attendance
          .map(
            (record) => `
              <tr>
                <td>${escapeHtml(record.full_name)}</td>
                <td>${escapeHtml(record.state_code)}</td>
                <td>${escapeHtml(record.phone)}</td>
                <td>${escapeHtml(new Date(record.timestamp).toLocaleString())}</td>
                <td>${record.distance_meters ?? ''}</td>
                <td>${escapeHtml(record.status)}</td>
              </tr>
            `
          )
          .join('')}
        </tbody>
      </table>
    `;
  } catch (error) {
    attendanceList.innerHTML = `<p class="small-text">${escapeHtml(error.message || 'Unable to load attendance')}</p>`;
  }
};

const copyScanLink = () => {
  if (!selectedSession) return;
  const scanLink = `${window.location.origin}/scan?sessionId=${encodeURIComponent(selectedSession.id)}`;
  navigator.clipboard.writeText(scanLink).then(() => {
    showMessage('Scan link copied to clipboard.');
  }, () => {
    showMessage('Unable to copy scan link.', true);
  });
};

const printQr = () => {
  if (!qrCanvas) return;
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    showMessage('Unable to open print window.', true);
    return;
  }
  const imageUrl = qrCanvas.toDataURL();
  printWindow.document.write(`<!DOCTYPE html><html><head><title>Print QR Code</title></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><img src="${imageUrl}" alt="QR Code" style="max-width:90%;height:auto;" /></body></html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
};

const exportAttendance = async () => {
  if (!selectedSession) {
    showMessage('Select a session before exporting attendance.', true);
    return;
  }

  try {
    const response = await fetch(`/api/admin/session/${encodeURIComponent(selectedSession.id)}/attendance`, { headers: apiHeaders() });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const attendance = await response.json();

    const rows = [
      ['Name', 'State Code', 'Phone', 'Timestamp', 'Distance (m)', 'Status'],
      ...attendance.map((record) => [
        record.full_name ?? '',
        record.state_code ?? '',
        record.phone ?? '',
        record.timestamp ? new Date(record.timestamp).toISOString() : '',
        record.distance_meters ?? '',
        record.status ?? '',
      ]),
    ];

    const csvContent = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedSession.meeting_name || 'attendance'}-attendance.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showMessage('Attendance exported as CSV.');
  } catch (error) {
    showMessage(error.message || 'Unable to export attendance', true);
  }
};

const escapeHtml = (text) => String(text)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

unlockAdminButton?.addEventListener('click', unlockAdmin);
saveSessionButton?.addEventListener('click', createSession);
refreshSessionsButton?.addEventListener('click', async (event) => {
  event.preventDefault();
  try {
    const sessions = await fetchSessions();
    renderSessions(sessions);
  } catch (error) {
    showMessage(error.message || 'Unable to refresh sessions', true);
  }
});
copyLinkButton?.addEventListener('click', copyScanLink);
printQrButton?.addEventListener('click', printQr);
exportAttendanceButton?.addEventListener('click', exportAttendance);
const logoutAdminButton = document.getElementById('logoutAdmin');

const setAdminView = (authenticated) => {
  if (adminPanel) adminPanel.style.display = authenticated ? 'block' : 'none';
  if (adminAuthSection) adminAuthSection.style.display = authenticated ? 'none' : 'block';
  if (logoutAdminButton) logoutAdminButton.style.display = authenticated ? 'inline-flex' : 'none';
};

const logoutAdmin = () => {
  adminAccessToken = null;
  setAdminView(false);
  if (adminEmailInput) adminEmailInput.value = '';
  if (adminPasswordInput) adminPasswordInput.value = '';
  showMessage('Signed out successfully.');
};

logoutAdminButton?.addEventListener('click', logoutAdmin);
