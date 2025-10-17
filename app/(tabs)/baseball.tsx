import SportPage from '@/components/SportPage';

export default function BaseballScreen() {
  return (
    <SportPage 
      sports={['MLB']} 
      title="Baseball" 
      subtitle="MLB MTO Predictions" 
    />
  );
}
