import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from './utils/test-utils';
import CreateBeerCallModal from '../components/Modals/CreateBeerCallModal';
import RespondBeerCallModal from '../components/Modals/RespondBeerCallModal';
import ScheduleAperoModal from '../components/Modals/ScheduleAperoModal';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
    api: {
        post: vi.fn(),
    }
}));

// Mock URL.createObjectURL/revokeObjectURL
global.URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
global.URL.revokeObjectURL = vi.fn();

// Mock FileReader and Canvas for processImageForBackend
global.FileReader = class {
    result: string | null = null;
    timer: ReturnType<typeof setTimeout> | null = null;
    onload: ((e: { target: { result: string } }) => void) | null = null;
    onerror: ((e: Error) => void) | null = null;
    readAsDataURL() {
        this.timer = setTimeout(() => {
            this.result = 'data:image/jpeg;base64,fake';
            if (this.onload) this.onload({ target: { result: this.result } });
        }, 10);
    }
    abort() {
        if (this.timer) clearTimeout(this.timer);
    }
} as unknown as typeof FileReader;

global.Image = class {
    onload: (() => void) | null = null;
    width = 100;
    height = 100;
    _src = '';
    set src(val: string) {
        this._src = val;
        setTimeout(() => {
            if (this.onload) this.onload();
        }, 10);
    }
    get src() {
        return this._src;
    }
} as unknown as typeof global.Image;

HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    drawImage: vi.fn(),
}) as unknown as typeof HTMLCanvasElement.prototype.getContext;

HTMLCanvasElement.prototype.toBlob = function(callback: BlobCallback) {
    setTimeout(() => {
        callback(new Blob(['fake-image-content'], { type: 'image/jpeg' }));
    }, 10);
};

describe('BeerCall Modals', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    it('CreateBeerCallModal: submit with photo and location', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onClose = vi.fn();
        const photoFile = new File(['dummy'], 'photo.png', { type: 'image/png' });
        const location = { lat: 48.8566, lng: 2.3522 };
        
        vi.mocked(api.post).mockResolvedValueOnce({ data: { id: 'call-1' } });
        
        render(<CreateBeerCallModal squadId="sq-1" photoFile={photoFile} location={location} scheduledApero={null} onClose={onClose} />);
        
        const locationInput = screen.getByPlaceholderText(/Ex: Bar Le Central\.\.\./i);
        const submitBtn = screen.getByRole('button', { name: /LANCER L'APPEL/i });
        
        expect(submitBtn).toBeDisabled();
        
        await user.type(locationInput, 'Mon super bar');
        expect(submitBtn).not.toBeDisabled();
        
        await user.click(submitBtn);
        
        // Let promises resolve
        await vi.runAllTimersAsync();
        
        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/squads/sq-1/beer-calls/', expect.any(FormData), expect.any(Object));
        });
        const formData = vi.mocked(api.post).mock.calls[0][1] as FormData;
        expect(formData.get('location_name')).toBe('Mon super bar');
        expect(formData.get('latitude')).toBe('48.8566');
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('RespondBeerCallModal: accept and submit photo', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onClose = vi.fn();
        const beerCall = { id: 'call-1', location_name: 'Le Central', creator_name: 'Creator' };
        const location = { lat: 48.8, lng: 2.3 };
        
        vi.mocked(api.post).mockResolvedValueOnce({ data: { success: true } });
        
        render(<RespondBeerCallModal isOpen={true} onClose={onClose} beerCall={beerCall} squadId="sq-1" location={location} />);
        
        // 1. Click J'y Vais
        const acceptBtn = screen.getByRole('button', { name: /J'y Vais !/i });
        await user.click(acceptBtn);
        
        // 2. Upload photo (file input is hidden, use fireEvent.change)
        // Wait for accepting step to show
        await screen.findByText(/Prouve-le !/i);
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        const photoFile = new File(['dummy'], 'photo.png', { type: 'image/png' });
        fireEvent.change(fileInput, { target: { files: [photoFile] } });
        
        // 3. Submit
        const submitBtn = await screen.findByRole('button', { name: /VALIDATION IA/i });
        expect(submitBtn).not.toBeDisabled();
        await user.click(submitBtn);
        
        await vi.runAllTimersAsync();
        
        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/squads/sq-1/beer-calls/call-1/join/', expect.any(FormData), expect.any(Object));
        });
        const formData = vi.mocked(api.post).mock.calls[0][1] as FormData;
        expect(formData.get('lat')).toBe('48.8');
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('ScheduleAperoModal: submit coordinates', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onClose = vi.fn();
        vi.mocked(api.post).mockResolvedValueOnce({ data: { id: 'sched-1' } });
        
        render(<ScheduleAperoModal isOpen={true} onClose={onClose} squadId="sq-1" coordinates={{ lat: 48.8, lng: 2.3 }} />);
        
        const locInput = screen.getByPlaceholderText(/Ex: Bar Le Central/i);
        const timeInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
        const submitBtn = screen.getByRole('button', { name: /PROGRAMMER/i });
        
        await user.type(locInput, 'Chez Roger');
        fireEvent.change(timeInput, { target: { value: '2026-12-31T20:00' } });
        fireEvent.blur(timeInput);
        
        await waitFor(() => {
            expect(submitBtn).not.toBeDisabled();
        });
        await user.click(submitBtn);
        
        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/squads/sq-1/scheduled-beer-calls/', expect.objectContaining({
                location_name: 'Chez Roger',
            }));
        });
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('CreateBeerCallModal: submit with photo and location, handles error', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onClose = vi.fn();
        const photoFile = new File(['dummy'], 'photo.png', { type: 'image/png' });
        const location = { lat: 48.8566, lng: 2.3522 };
        
        vi.mocked(api.post).mockRejectedValueOnce(new Error('Network error'));
        
        render(<CreateBeerCallModal squadId="sq-1" photoFile={photoFile} location={location} scheduledApero={null} onClose={onClose} />);
        
        const locationInput = screen.getByPlaceholderText(/Ex: Bar Le Central\.\.\./i);
        const submitBtn = screen.getByRole('button', { name: /LANCER L'APPEL/i });
        
        await user.type(locationInput, 'Mon super bar');
        await user.click(submitBtn);
        await vi.runAllTimersAsync();
        
        await waitFor(() => {
            expect(submitBtn).not.toBeDisabled();
        });
        expect(onClose).not.toHaveBeenCalled();
        const firstKey = vi.mocked(api.post).mock.calls[0][2]?.headers?.['Idempotency-Key'];
        expect(firstKey).toEqual(expect.any(String));
        vi.mocked(api.post).mockResolvedValueOnce({ data: {} });
        await user.click(submitBtn);
        await vi.runAllTimersAsync();
        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
        expect(vi.mocked(api.post).mock.calls[1][2]?.headers?.['Idempotency-Key']).toBe(firstKey);
    });

    it('RespondBeerCallModal: accept and submit photo, handles error', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onClose = vi.fn();
        const beerCall = { id: 'call-1', location_name: 'Le Central', creator_name: 'Creator' };
        
        vi.mocked(api.post).mockRejectedValueOnce(new Error('Rejected'));
        
        render(<RespondBeerCallModal isOpen={true} onClose={onClose} beerCall={beerCall} squadId="sq-1" location={{ lat: 0, lng: 0 }} />);
        
        await user.click(screen.getByRole('button', { name: /J'y Vais !/i }));
        await screen.findByText(/Prouve-le !/i);
        
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        fireEvent.change(fileInput, { target: { files: [new File(['dummy'], 'photo.png', { type: 'image/png' })] } });
        
        const submitBtn = await screen.findByRole('button', { name: /VALIDATION IA/i });
        await user.click(submitBtn);
        await vi.runAllTimersAsync();
        
        await waitFor(() => {
            expect(submitBtn).not.toBeDisabled();
        });
        expect(onClose).not.toHaveBeenCalled();
    });

    it('ScheduleAperoModal: submit coordinates, handles error', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const onClose = vi.fn();
        vi.mocked(api.post).mockRejectedValueOnce(new Error('Api error'));
        
        render(<ScheduleAperoModal isOpen={true} onClose={onClose} squadId="sq-1" coordinates={{ lat: 48.8, lng: 2.3 }} />);
        
        const locInput = screen.getByPlaceholderText(/Ex: Bar Le Central/i);
        const timeInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
        const submitBtn = screen.getByRole('button', { name: /PROGRAMMER/i });
        
        await user.type(locInput, 'Chez Roger');
        fireEvent.change(timeInput, { target: { value: '2026-12-31T20:00' } });
        fireEvent.blur(timeInput);
        
        await waitFor(() => expect(submitBtn).not.toBeDisabled());
        await user.click(submitBtn);
        
        await waitFor(() => {
            expect(submitBtn).not.toBeDisabled();
        });
        expect(onClose).not.toHaveBeenCalled();
    });
});
