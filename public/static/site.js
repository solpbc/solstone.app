// solstone.app — the shared page behaviour. The mobile menu is a <details>, so
// it opens and closes without this file; this adds the two ways people expect
// to dismiss it: Escape (focus returns to the menu button) and a click or tap
// anywhere outside it. Nothing is sent or stored.
(function () {
    var menus = document.querySelectorAll('details.site-menu');
    if (!menus.length) return;
    document.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape') return;
        menus.forEach(function (menu) {
            if (!menu.open) return;
            menu.open = false;
            menu.querySelector('summary').focus();
        });
    });
    document.addEventListener('click', function (event) {
        menus.forEach(function (menu) {
            if (menu.open && !menu.contains(event.target)) menu.open = false;
        });
    });
})();
