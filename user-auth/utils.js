export function displayMessage(msgId, message, type = 'success') {
    const msgBox = document.getElementById(msgId);
    if (!msgBox) return;
    
    msgBox.classList.remove('success', 'error', 'warning', 'info');
    msgBox.classList.add(type);
    msgBox.textContent = message;
    msgBox.style.display = 'block';
    
    if (type === 'success') {
        setTimeout(() => msgBox.style.display = 'none', 3000);
    }
}
