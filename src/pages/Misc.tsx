import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui';

export function NotFound() {
  return (
    <div className="page">
      <EmptyState title="This page doesn’t exist" action={<Link to="/" className="btn btn-primary">Go home</Link>}>
        Maybe a link was mistyped?
      </EmptyState>
    </div>
  );
}
