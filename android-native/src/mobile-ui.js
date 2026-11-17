/* Mi Note Android v0.6: escritura primero; la PWA pública no cambia. */
const $ = (id) => document.getElementById(id);
function initMobileUi() {
  const connect = $('x10OpenBtn');
  const direct = $('x10DirectConnect');
  const menu = $('mobileMoreDialog');
  const more = $('mobileMoreBtn');
  const close = $('closeMobileMore');
  const nav = document.querySelector('.page-pager');
  const dock = $('mobilePageDock');
  const pageCount = $('pageCount');
  const pageNumber = $('pageNumber');
  const total = $('mobileTotalPages');
  const paper = $('paperSelect');
  const paperMobile = $('mobilePaperSelect');
  const width = $('penWidth');
  const widthMobile = $('mobilePenWidth');
  const widthOut = $('mobileWidthValue');

  if (!connect || !direct || !menu || !more || !nav || !dock || !pageNumber) {
    console.error('Mi Note V0.6: faltan controles esenciales; no se modifica Bluetooth.');
    return;
  }
  // Mantener el botón original, incluido su estado BLE. Cambiar solo su acción.
  // El selector Android se invoca SIN await ni diálogo intermediario.
  connect.title = 'Conectar Huion X10 directamente';
  connect.setAttribute('aria-label', 'Conectar Huion X10 directamente');
  connect.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    direct.click();
  }, true);

  dock.append(nav);
  nav.setAttribute('aria-label', 'Cambiar páginas');
  function refreshPages() {
    if (!total) return;
    const count = Number.parseInt(pageCount?.textContent || '1', 10);
    total.textContent = '/ ' + (Number.isFinite(count) && count > 0 ? count : '1');
  }
  if (pageCount && total) {
    new MutationObserver(refreshPages).observe(pageCount, {childList:true,characterData:true,subtree:true});
    refreshPages();
  }

  if (paper?.parentElement) paper.parentElement.classList.add('minote-paper-control');
  if (width?.parentElement) width.parentElement.classList.add('minote-width-control');
  function syncMenu() {
    if (paper && paperMobile) paperMobile.value = paper.value;
    if (width && widthMobile) {
      widthMobile.value = width.value;
      if (widthOut) widthOut.textContent = width.value;
    }
  }
  paperMobile?.addEventListener('change', () => {
    if (!paper) return;
    paper.value = paperMobile.value;
    paper.dispatchEvent(new Event('change',{bubbles:true}));
  });
  widthMobile?.addEventListener('input', () => {
    if (!width) return;
    width.value = widthMobile.value;
    width.dispatchEvent(new Event('input',{bubbles:true}));
    if (widthOut) widthOut.textContent = width.value;
  });
  paper?.addEventListener('change', syncMenu);
  width?.addEventListener('input', syncMenu);

  more.addEventListener('click', () => {
    syncMenu();
    menu.showModal();
  });
  close?.addEventListener('click', () => menu.close());
  menu.addEventListener('click',(event) => {
    if (event.target === menu) menu.close();
  });
  menu.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = $(button.getAttribute('data-action'));
      menu.close();
      // Las acciones originales se reutilizan, sin alterar el almacén local.
      if (target && !target.disabled) target.click();
    });
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMobileUi, {once:true});
} else {
  initMobileUi();
}
