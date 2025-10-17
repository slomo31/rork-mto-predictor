import SportPage from '@/components/SportPage';

export default function CFBScreen() {
  return (
    <SportPage 
      sports={['NCAA_FB']} 
      title="College Football" 
      subtitle="NCAA Football MTO Predictions" 
    />
  );
}
