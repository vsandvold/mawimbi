import './CountIn.css';

type CountInProps = {
  beat: number;
};

const CountIn = (props: CountInProps) => {
  const { beat } = props;

  return (
    <div className="count-in">
      <span key={beat} className="count-in__beat">
        {beat}
      </span>
    </div>
  );
};

export default CountIn;
