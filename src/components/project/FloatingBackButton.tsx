import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/button';
import './FloatingBackButton.css';

const FloatingBackButton = () => {
  return (
    <Link to="/" className="floating-back-button" aria-label="Back">
      <Button
        variant="ghost"
        size="icon-lg"
        className="button floating-back-button__icon"
        tabIndex={-1}
      >
        <ArrowLeft />
      </Button>
    </Link>
  );
};

export default FloatingBackButton;
