import { useRouter } from '@tanstack/react-router';
import { forwardRef, type AnchorHTMLAttributes } from 'react';

/** Свойства совместимого anchor до удаления конечного next/link adapter. */
type LegacyLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

/** Адаптирует конечный legacy Link API к router оболочки с сохранением обычных anchor actions. */
export const LegacyNavigationLink = forwardRef<HTMLAnchorElement, LegacyLinkProps>(
  function LegacyNavigationLink({ href, onClick, target, download, ...props }, ref) {
    const router = useRouter();
    return (
      <a
        {...props}
        ref={ref}
        href={href}
        target={target}
        download={download}
        onClick={(event) => {
          onClick?.(event);
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            (target && target !== '_self') ||
            download !== undefined
          )
            return;
          const destination = new URL(href, window.location.href);
          if (
            destination.origin !== window.location.origin ||
            !['http:', 'https:'].includes(destination.protocol) ||
            href.startsWith('#')
          )
            return;
          event.preventDefault();
          void router.navigate({
            href: destination.pathname + destination.search + destination.hash,
          });
        }}
      />
    );
  },
);

export default LegacyNavigationLink;
