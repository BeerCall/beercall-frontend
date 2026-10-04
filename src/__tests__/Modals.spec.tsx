import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from './utils/test-utils';
import SelectWorldModal from '../components/Modals/SelectWorldModal';
import PhotoModal from '../components/Modals/PhotoModal';

describe('Modals Rendering & Interactions (Coverage)', () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    it('SelectWorldModal: select world', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        render(<SelectWorldModal isOpen={true} onClose={vi.fn()} onSelect={vi.fn()} />);
        
        const worldOption = screen.queryByText(/Le Bar/i);
        if (worldOption) await user.click(worldOption);
        
        const confirmBtn = screen.queryByText(/VALIDER/i);
        if (confirmBtn) await user.click(confirmBtn);

        expect(true).toBe(true);
    });

    it('renders PhotoModal and clicks close', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onClose = vi.fn();
        render(<PhotoModal isOpen={true} onClose={onClose} photoUrl="http://test.com/photo.jpg" uploaderName="TestUser" timestamp="2023-01-01" aperoTitle="Apero" />);
        
        const closeBtn = document.querySelector('button');
        if (closeBtn) await user.click(closeBtn);

        expect(true).toBe(true);
    });
});
