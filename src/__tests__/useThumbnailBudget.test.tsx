import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React, { useRef } from 'react';
import { ThumbnailBudgetProvider, useThumbnailSlot } from '../hooks/useThumbnailBudget';

function CandidateItem({
  id,
  inView = true,
  top = 0,
  height = 100,
}: {
  id: string;
  inView?: boolean;
  top?: number;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    if (ref.current) {
      ref.current.getBoundingClientRect = () => ({
        top,
        bottom: top + height,
        left: 0,
        right: 100,
        width: 100,
        height,
        x: 0,
        y: top,
        toJSON: () => {},
      });
    }
  }, [top, height]);

  const granted = useThumbnailSlot(id, inView, ref);

  return (
    <div
      ref={ref}
      data-testid={`candidate-${id}`}
      data-granted={granted ? 'true' : 'false'}
      style={{ height: `${height}px` }}
    >
      Candidate {id}: {granted ? 'GRANTED' : 'DENIED'}
    </div>
  );
}

describe('useThumbnailBudget Hook & Provider', () => {
  it('accorde au maximum deux slots parmi plusieurs candidats inView', async () => {
    render(
      <ThumbnailBudgetProvider maxSlots={2}>
        <CandidateItem id="a" inView={true} top={0} />
        <CandidateItem id="b" inView={true} top={50} />
        <CandidateItem id="c" inView={true} top={100} />
        <CandidateItem id="d" inView={true} top={150} />
      </ThumbnailBudgetProvider>
    );

    // Permettre la résolution de la microtâche planifiée par scheduleRecompute
    await act(async () => {
      await Promise.resolve();
    });

    const items = screen.getAllByTestId(/^candidate-/);
    const grantedItems = items.filter(el => el.getAttribute('data-granted') === 'true');
    const deniedItems = items.filter(el => el.getAttribute('data-granted') === 'false');

    expect(grantedItems).toHaveLength(2);
    expect(deniedItems).toHaveLength(2);
  });

  it('privilégie les candidats les plus proches du centre du conteneur', async () => {
    function ContainerHarness() {
      const containerRef = useRef<HTMLDivElement>(null);

      React.useLayoutEffect(() => {
        if (containerRef.current) {
          containerRef.current.getBoundingClientRect = () => ({
            top: 0,
            bottom: 400,
            left: 0,
            right: 300,
            width: 300,
            height: 400,
            x: 0,
            y: 0,
            toJSON: () => {},
          });
        }
      }, []);

      return (
        <div
          ref={containerRef}
          style={{ height: '400px' }}
        >
          <ThumbnailBudgetProvider maxSlots={2} containerRef={containerRef}>
            {/* Centre du container = 200 */}
            {/* item-loin-haut: top=0, center=50 -> dist=150 */}
            <CandidateItem id="loin-haut" inView={true} top={0} height={100} />
            {/* item-proche-1: top=160, center=200 -> dist=0 */}
            <CandidateItem id="proche-1" inView={true} top={160} height={80} />
            {/* item-proche-2: top=220, center=260 -> dist=60 */}
            <CandidateItem id="proche-2" inView={true} top={220} height={80} />
            {/* item-loin-bas: top=350, center=400 -> dist=200 */}
            <CandidateItem id="loin-bas" inView={true} top={350} height={100} />
          </ThumbnailBudgetProvider>
        </div>
      );
    }

    render(<ContainerHarness />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId('candidate-proche-1')).toHaveAttribute('data-granted', 'true');
    expect(screen.getByTestId('candidate-proche-2')).toHaveAttribute('data-granted', 'true');
    expect(screen.getByTestId('candidate-loin-haut')).toHaveAttribute('data-granted', 'false');
    expect(screen.getByTestId('candidate-loin-bas')).toHaveAttribute('data-granted', 'false');
  });

  it('libère le slot et réattribue au candidat suivant lors du démontage', async () => {
    function DynamicList({ showA }: { showA: boolean }) {
      return (
        <ThumbnailBudgetProvider maxSlots={1}>
          {showA && <CandidateItem id="a" inView={true} top={334} height={100} />}
          <CandidateItem id="b" inView={true} top={0} height={100} />
        </ThumbnailBudgetProvider>
      );
    }

    const { rerender } = render(<DynamicList showA={true} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId('candidate-a')).toHaveAttribute('data-granted', 'true');
    expect(screen.getByTestId('candidate-b')).toHaveAttribute('data-granted', 'false');

    // Démontage de candidat A
    rerender(<DynamicList showA={false} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByTestId('candidate-a')).not.toBeInTheDocument();
    expect(screen.getByTestId('candidate-b')).toHaveAttribute('data-granted', 'true');
  });

  it('réagit au changement de visibilité (inView bascule à false)', async () => {
    function ToggleVisibilityList({ aInView }: { aInView: boolean }) {
      return (
        <ThumbnailBudgetProvider maxSlots={1}>
          <CandidateItem id="a" inView={aInView} top={334} height={100} />
          <CandidateItem id="b" inView={true} top={0} height={100} />
        </ThumbnailBudgetProvider>
      );
    }

    const { rerender } = render(<ToggleVisibilityList aInView={true} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId('candidate-a')).toHaveAttribute('data-granted', 'true');
    expect(screen.getByTestId('candidate-b')).toHaveAttribute('data-granted', 'false');

    // A sort de la vue
    rerender(<ToggleVisibilityList aInView={false} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId('candidate-a')).toHaveAttribute('data-granted', 'false');
    expect(screen.getByTestId('candidate-b')).toHaveAttribute('data-granted', 'true');
  });

  it('hors provider, useThumbnailSlot retourne directement la valeur inView', () => {
    function Standalone({ inView }: { inView: boolean }) {
      const granted = useThumbnailSlot('isolated', inView, null);
      return <div data-testid="isolated" data-granted={granted ? 'true' : 'false'} />;
    }

    const { rerender } = render(<Standalone inView={true} />);
    expect(screen.getByTestId('isolated')).toHaveAttribute('data-granted', 'true');

    rerender(<Standalone inView={false} />);
    expect(screen.getByTestId('isolated')).toHaveAttribute('data-granted', 'false');
  });
});
