type OuroLogoProps = {
  size?: number;
  className?: string;
};

/** The surrounding home link supplies the visible name and accessible label. */
export default function OuroLogo({size = 28, className}: OuroLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M31.4 12.5A13.6 13.6 0 1 1 20 6.4"
        stroke="currentColor"
        strokeWidth="3.3"
        strokeLinecap="round"
      />
      <path
        d="M17.7 4.8C21.6 3.8 25.7 4.7 28.6 7.8L31.1 10.2 27.5 10.7 24.6 9.2C22.6 8.2 20.7 8 18.6 8.3ZM26.6 6.9a.8.8 0 1 0-1.6 0 .8.8 0 1 0 1.6 0Z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
      <circle cx="6.4" cy="20" r="2.8" fill="currentColor" />
      <circle cx="29.6" cy="29.6" r="2.8" fill="currentColor" />
      <path d="m27.7 27.7-5.5-5.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="20" cy="20" r="3.1" stroke="currentColor" strokeWidth="2.3" />
    </svg>
  );
}
