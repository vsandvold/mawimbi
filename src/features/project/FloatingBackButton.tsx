import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../shared/ui/button';
import './FloatingBackButton.css';

const FloatingBackButton = () => {
  return (
    <Link
      to="/"
      className="floating-back-button floating-button"
      aria-label="Back"
    >
      <Button variant="ghost" size="icon-lg" className="button" tabIndex={-1}>
        <ArrowLeft />
      </Button>
    </Link>
  );
};

export default FloatingBackButton;
