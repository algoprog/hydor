import React from 'react';

/** A view with braces in JSX text. */
export function View({ items }: { items: string[] }) {
  const style = { color: 'red' };
  return (
    <div style={style}>
      {"}"} and {'{'} text don't break
      {items.map((i) => <span key={i}>{i}</span>)}
    </div>
  );
}

export const Arrow = () => <p>{'{'}</p>;

export default function Page() {
  return <View items={[]} />;
}
