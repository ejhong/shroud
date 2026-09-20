document.querySelectorAll('[data-photo]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-photo]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  document.getElementById('hero-image').classList.toggle('inverted',button.dataset.photo==='inverse');
}));
