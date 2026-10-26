import {describe, expect, it, vi} from 'vitest';
import {screen} from '@testing-library/react';
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
  });
});
