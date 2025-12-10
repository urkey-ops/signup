export function displayMessage(msgId, message, type = 'success') {
    const msgBox = document.getElementById(msgId);
    if (!msgBox) return;
    
    msgBox.classList.remove('success', 'error', 'warning', 'info');
    msgBox.classList.add(type);
    msgBox.textContent = message;
    msgBox.style.display = 'block';
    msgBox.setAttribute('role', 'alert');
    
    if (type === 'success') {
        setTimeout(() => {
            msgBox.style.display = 'none';
            msgBox.removeAttribute('role');
        }, 5000);
    }
}

export function clearMessage(msgId) {
    const msgBox = document.getElementById(msgId);
    if (!msgBox) return;
    
    msgBox.style.display = 'none';
    msgBox.textContent = '';
    msgBox.removeAttribute('role');
}
