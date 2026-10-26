import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React, { useRef } from 'react';
import { ThumbnailBudgetProvider, useThumbnailSlot } from '../hooks/useThumbnailBudget';

// Le recalcul est planifié dans une frame annulable : laisser jsdom exécuter le rAF.
const flushFrame = async () => {
  await act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 32));
  });
};

function LiveCandidate({
  id,
  tops,
  height = 100,
  inView = true,
}: {
  id: string;
  tops: Record<string, number>;
  height?: number;
  inView?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    if (ref.current) {
      ref.current.getBoundingClientRect = () => {
        const top = tops[id] ?? 0;
        return {
          top,
          bottom: top + height,
          left: 0,
          right: 100,
          width: 100,
          height,
          x: 0,
          y: top,
          toJSON: () => {},
        };
      };
    }
  }, [id, height, tops]);

  const granted = useThumbnailSlot(id, inView, ref);

  return <div ref={ref} data-testid={`candidate-${id}`} data-granted={granted ? 'true' : 'false'} />;
}

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
    await flushFrame();

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

    await flushFrame();

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

    await flushFrame();

    expect(screen.getByTestId('candidate-a')).toHaveAttribute('data-granted', 'true');
    expect(screen.getByTestId('candidate-b')).toHaveAttribute('data-granted', 'false');

    // Démontage de candidat A
    rerender(<DynamicList showA={false} />);

    await flushFrame();

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

    await flushFrame();

    expect(screen.getByTestId('candidate-a')).toHaveAttribute('data-granted', 'true');
    expect(screen.getByTestId('candidate-b')).toHaveAttribute('data-granted', 'false');

    // A sort de la vue
    rerender(<ToggleVisibilityList aInView={false} />);

    await flushFrame();

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

  it('un défilement du scrollport change les deux élus même si les flags inView ne changent pas', async () => {
    const tops: Record<string, number> = {a: 160, b: 220, c: 300, d: 420};

    function Harness() {
      const containerRef = useRef<HTMLDivElement>(null);
      React.useLayoutEffect(() => {
        if (containerRef.current) {
          containerRef.current.getBoundingClientRect = () => ({
            top: 0, bottom: 400, left: 0, right: 300, width: 300, height: 400, x: 0, y: 0, toJSON: () => {},
          });
        }
      }, []);
      return (
        <div ref={containerRef} style={{height: '400px'}}>
          <ThumbnailBudgetProvider maxSlots={2} containerRef={containerRef}>
            <LiveCandidate id="a" tops={tops} />
            <LiveCandidate id="b" tops={tops} />
            <LiveCandidate id="c" tops={tops} />
            <LiveCandidate id="d" tops={tops} />
          </ThumbnailBudgetProvider>
        </div>
      );
    }

    const { container } = render(<Harness />);
    await flushFrame();

    expect(screen.getByTestId('candidate-a')).toHaveAttribute('data-granted', 'true');
    expect(screen.getByTestId('candidate-b')).toHaveAttribute('data-granted', 'true');

    // Mêmes flags inView, positions nouvelles, sans changer les états React.
    tops.a = 500;
    tops.b = 60;
    tops.c = 140;
    tops.d = 200;

    await act(async () => {
      container.querySelector('div[style]')?.dispatchEvent(new Event('scroll'));
    });
    await flushFrame();

    expect(screen.getByTestId('candidate-c')).toHaveAttribute('data-granted', 'true');
    expect(screen.getByTestId('candidate-d')).toHaveAttribute('data-granted', 'true');
    expect(screen.getByTestId('candidate-a')).toHaveAttribute('data-granted', 'false');
    expect(screen.getByTestId('candidate-b')).toHaveAttribute('data-granted', 'false');
  });

  it('exclut un candidat hors du scrollport même avec inView=true (marge de préchargement)', async () => {
    const tops: Record<string, number> = {dedans: 150, dehors: 1000};

    function Harness() {
      const containerRef = useRef<HTMLDivElement>(null);
      React.useLayoutEffect(() => {
        if (containerRef.current) {
          containerRef.current.getBoundingClientRect = () => ({
            top: 0, bottom: 400, left: 0, right: 300, width: 300, height: 400, x: 0, y: 0, toJSON: () => {},
          });
        }
      }, []);
      return (
        <div ref={containerRef} style={{height: '400px'}}>
          <ThumbnailBudgetProvider maxSlots={2} containerRef={containerRef}>
            <LiveCandidate id="dehors" tops={tops} inView={true} />
            <LiveCandidate id="dedans" tops={tops} inView={true} />
          </ThumbnailBudgetProvider>
        </div>
      );
    }

    render(<Harness />);
    await flushFrame();

    expect(screen.getByTestId('candidate-dedans')).toHaveAttribute('data-granted', 'true');
    expect(screen.getByTestId('candidate-dehors')).toHaveAttribute('data-granted', 'false');
  });

  it('trente profils : exactement deux slots, dont un vrai candidat rendu', async () => {
    const tops: Record<string, number> = {};
    for (let i = 0; i < 30; i++) tops[`p${i}`] = i * 60;

    function Harness() {
      const containerRef = useRef<HTMLDivElement>(null);
      React.useLayoutEffect(() => {
        if (containerRef.current) {
          containerRef.current.getBoundingClientRect = () => ({
            top: 0, bottom: 400, left: 0, right: 300, width: 300, height: 400, x: 0, y: 0, toJSON: () => {},
          });
        }
      }, []);
      return (
        <div ref={containerRef} style={{height: '400px'}}>
          <ThumbnailBudgetProvider maxSlots={2} containerRef={containerRef}>
            {Array.from({length: 30}, (_, i) => <LiveCandidate key={i} id={`p${i}`} tops={tops} />)}
          </ThumbnailBudgetProvider>
        </div>
      );
    }

    render(<Harness />);
    await flushFrame();

    const granted = screen.getAllByTestId(/^candidate-p/).filter(el => el.getAttribute('data-granted') === 'true');
    expect(granted).toHaveLength(2);
    expect(granted.length).toBeGreaterThanOrEqual(1);
  });

  it('un changement de slots ne réinscrit pas les candidats déjà enregistrés', async () => {
    const tops: Record<string, number> = {'stab-a': 160, 'stab-b': 220, 'stab-c': 300};
    const setSpy = vi.spyOn(Map.prototype, 'set');

    function Harness() {
      const containerRef = useRef<HTMLDivElement>(null);
      React.useLayoutEffect(() => {
        if (containerRef.current) {
          containerRef.current.getBoundingClientRect = () => ({
            top: 0, bottom: 400, left: 0, right: 300, width: 300, height: 400, x: 0, y: 0, toJSON: () => {},
          });
        }
      }, []);
      return (
        <div ref={containerRef} style={{height: '400px'}}>
          <ThumbnailBudgetProvider maxSlots={1} containerRef={containerRef}>
            <LiveCandidate id="stab-a" tops={tops} />
            <LiveCandidate id="stab-b" tops={tops} />
            <LiveCandidate id="stab-c" tops={tops} />
          </ThumbnailBudgetProvider>
        </div>
      );
    }

    const { container } = render(<Harness />);
    await flushFrame();

    const registrations = () => setSpy.mock.calls.filter(([key]) => String(key).startsWith('stab-')).length;
    expect(registrations()).toBe(3);

    tops['stab-a'] = 1000;
    tops['stab-b'] = 150;

    await act(async () => {
      container.querySelector('div[style]')?.dispatchEvent(new Event('scroll'));
    });
    await flushFrame();

    // Les slots changent (b remplace a) sans réinscrire a/b/c.
    expect(screen.getByTestId('candidate-stab-b')).toHaveAttribute('data-granted', 'true');
    expect(registrations()).toBe(3);
    setSpy.mockRestore();
  });
});
