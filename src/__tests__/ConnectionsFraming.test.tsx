import {describe, expect, it, vi} from 'vitest';
import {act, screen} from '@testing-library/react';
import {render} from './utils/test-utils';
import Connections from '../pages/Connections';

const avatarProps = vi.hoisted(() => ({last: null as Record<string, unknown> | null}));

// Le comportement 3D réel est couvert par avatarFraming.test.ts et SafeAvatar.test.tsx.
// Ici on prouve uniquement le câblage opt-in de la page.
vi.mock('../components/3D/SafeAvatar', () => ({
  default: (props: Record<string, unknown>) => {
    avatarProps.last = props;
    return <div data-testid="safe-avatar-stub" />;
  },
}));

vi.mock('../hooks/useThumbnailBudget', () => ({
  ThumbnailBudgetProvider: ({children}: {children: React.ReactNode}) => <>{children}</>,
  useThumbnailSlot: () => true,
}));

vi.mock('@tanstack/react-query', async () => ({
  ...await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query'),
  useQuery: () => ({
    isLoading: false,
    data: [{
      id: '7',
      username: 'LISA',
      caps: 3,
      score: 12,
      title: 'Brasseur',
      avatar: {head: 'head_base', body: 'body_tshirt', legs: 'legs_jeans', feet: 'shoes', accessory: 'none', gender: 'Women'},
    }],
  }),
}));

vi.mock('react-router-dom', async () => ({
  ...await vi.importActual<typeof import('react-router-dom')>('react-router-dom'),
  useNavigate: () => vi.fn(),
}));

vi.mock('framer-motion', async () => ({
  ...await vi.importActual<typeof import('framer-motion')>('framer-motion'),
  useInView: () => true,
}));

describe('Connexions - cadrage des miniatures (T30b)', () => {
  it('demande le cadrage thumbnail, une vue dédiée et un identifiant d instance stable', async () => {
    render(<Connections />);

    expect(await screen.findByTestId('safe-avatar-stub')).toBeInTheDocument();
    expect(avatarProps.last).toMatchObject({
      framing: 'thumbnail',
      view: 'connections-thumbnail',
      instanceId: 'connections-7',
      disableZoom: true,
      disablePan: true,
    });
    // No staggered entrance fade may delay an otherwise prepared avatar.
    const card = screen.getByText('LISA').closest('div.group');
    expect(card).toBeInTheDocument();
    expect(card).not.toHaveStyle({opacity: '0'});
    expect(card).not.toHaveStyle({transform: 'translateX(-20px)'});
  });

  it('prépare une vraie frame hors route puis suspend la miniature, et la réactive sans remontage', async () => {
    const view = render(<Connections active={false}/>);
    const avatar = await screen.findByTestId('safe-avatar-stub');
    expect(avatarProps.last?.active).toBe(true);
    act(() => (avatarProps.last?.onFrameSubmitted as () => void)());
    expect(avatarProps.last?.active).toBe(false);
    view.rerender(<Connections active/>);
    expect(avatarProps.last?.active).toBe(true);
    expect(screen.getByTestId('safe-avatar-stub')).toBe(avatar);
  });
});
