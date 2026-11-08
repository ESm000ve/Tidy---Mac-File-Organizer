import { useEffect } from "react";
/** Radix hides inactive modal layers with aria-hidden. Mirror only those
 * library-marked layers to inert so they also leave keyboard navigation. */
export function useInertHiddenLayers(): void {
    useEffect(() => {
        const owned = new Set<HTMLElement>();
        const sync = () => {
            for (const layer of owned) {
                if (!layer.isConnected || layer.getAttribute('data-aria-hidden') !== "true") {
                    layer.removeAttribute('inert');
                    owned.delete(layer);
                }
            }
            document.querySelectorAll<HTMLElement>('[data-aria-hidden="true"]').forEach(layer => {
                if (!layer.hasAttribute('inert')) {
                    layer.setAttribute('inert', '');
                    owned.add(layer);
                }
            });
        };
        const observer = new MutationObserver(sync);
        observer.observe(document.body, { attributes: true, attributeFilter: ['data-aria-hidden'], childList: true, subtree: true });
        sync();
        return () => { observer.disconnect(); owned.forEach(layer => layer.removeAttribute('inert')); };
    }, []);
}
