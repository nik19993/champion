export default function TestImage({ unoptimized, ...props }) {
  void unoptimized;
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={props.alt ?? ""} />;
}
