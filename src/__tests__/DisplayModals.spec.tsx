import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from './utils/test-utils';
import SelectWorldModal from '../components/Modals/SelectWorldModal';
import PhotoModal from '../components/Modals/PhotoModal';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
    api: {
        get: vi.fn(),
    }
}));

describe('Display Modals', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    it('SelectWorldModal: select world and close', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onClose = vi.fn();
        
        vi.mocked(api.get).mockResolvedValueOnce({
            data: {
                worlds: {
                    bar: { participants: [] },
                    piscine: { participants: [] },
                    dodo: { participants: [] }
                }
            }
        });

        render(<SelectWorldModal isOpen={true} onClose={onClose} squadId="sq-1" beerCallId="call-1" isActiveApero={true} />);
        
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith('/squads/sq-1/beer-calls/call-1/worlds');
        });
        
        const piscineTab = screen.getByText('piscine');
        await user.click(piscineTab);
        
        expect(screen.getByText(/Le Bassin des Lâches/i)).toBeInTheDocument();
        
        const closeBtn = document.querySelector('button');
        if (closeBtn) await user.click(closeBtn);
        
        expect(onClose).toHaveBeenCalled();
    });

    it('PhotoModal: swipe to change index and close', async () => {
        const onClose = vi.fn();
        const onIndexChange = vi.fn();
        
        const { getByAltText } = render(
            <PhotoModal 
                imageUrls={['url1.jpg', 'url2.jpg']} 
                currentIndex={0} 
                onClose={onClose} 
                onIndexChange={onIndexChange} 
            />
        );
        
        const img = getByAltText('Aperçu de la photo');
        expect(img.getAttribute('src')).toBe('url1.jpg');
        
        // Simulate swipe left
        fireEvent.touchStart(img, { touches: [{ clientX: 100, clientY: 100 }] });
        fireEvent.touchEnd(img, { changedTouches: [{ clientX: 20, clientY: 100 }] }); // diffX = -80 (swipe left)
        
        expect(onIndexChange).toHaveBeenCalledWith(1);
        
        // Simulate swipe down
        fireEvent.touchStart(img, { touches: [{ clientX: 100, clientY: 100 }] });
        fireEvent.touchEnd(img, { changedTouches: [{ clientX: 100, clientY: 200 }] }); // diffY = 100 (swipe down)
        
        expect(onClose).toHaveBeenCalled();
    });
});
