import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import QuestForge from './components/QuestForge';
import * as api from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    getAdminProblems: vi.fn(),
    createAdminProblem: vi.fn(),
    addAdminTestCase: vi.fn(),
    deleteAdminProblem: vi.fn(),
  };
});

describe('QuestForge Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.getAdminProblems as any).mockResolvedValue({
      data: [
        {
          id: 1,
          slug: 'two-sum',
          title: 'Two Sum',
          difficulty: 'medium',
          is_visible: true,
          best_time_complexity: 'O(N)',
          time_limit_sec: 2.0,
          memory_limit_kb: 262144,
          test_case_count: 3,
        },
        {
          id: 2,
          slug: 'binary-search',
          title: 'Binary Search',
          difficulty: 'easy',
          is_visible: true,
          best_time_complexity: 'O(log N)',
          time_limit_sec: 1.0,
          memory_limit_kb: 262144,
          test_case_count: 5,
        },
      ],
    });
  });

  it('renders existing quests and their optimal complexity badges', async () => {
    render(<QuestForge />);

    await waitFor(() => {
      expect(screen.getByText('Two Sum')).toBeDefined();
      expect(screen.getByText('Binary Search')).toBeDefined();
    });

    expect(screen.getByText(/⚡ O\(N\)/)).toBeDefined();
    expect(screen.getByText(/⚡ O\(log N\)/)).toBeDefined();
  });

  it('auto-generates slug from title and includes best time complexity options', async () => {
    render(<QuestForge />);

    const titleInput = screen.getByPlaceholderText('e.g. Merge K Sorted Lists') as HTMLInputElement;
    const slugInput = screen.getByPlaceholderText('merge-k-sorted-lists') as HTMLInputElement;

    fireEvent.change(titleInput, { target: { value: 'Valid Palindrome II' } });
    expect(slugInput.value).toBe('valid-palindrome-ii');

    const complexitySelect = screen.getByDisplayValue(/O\(N\) · Linear Time/i) as HTMLSelectElement;
    expect(complexitySelect).toBeDefined();
    expect(complexitySelect.value).toBe('O(N)');

    fireEvent.change(complexitySelect, { target: { value: 'O(N log N)' } });
    expect(complexitySelect.value).toBe('O(N log N)');
  });

  it('allows adding and removing test cases', async () => {
    render(<QuestForge />);

    expect(screen.getByText('Test Cases (2)')).toBeDefined();

    const addBtn = screen.getByText('Add Test Case');
    fireEvent.click(addBtn);

    expect(screen.getByText('Test Cases (3)')).toBeDefined();

    const removeBtns = screen.getAllByText('Remove');
    fireEvent.click(removeBtns[removeBtns.length - 1]);

    expect(screen.getByText('Test Cases (2)')).toBeDefined();
  });

  it('submits a new quest and adds test cases via API', async () => {
    (api.createAdminProblem as any).mockResolvedValue({
      data: { id: 10, slug: 'valid-anagram', message: 'Problem created' },
    });
    (api.addAdminTestCase as any).mockResolvedValue({
      data: { id: 101, message: 'Test case added' },
    });

    render(<QuestForge />);

    const titleInput = screen.getByPlaceholderText('e.g. Merge K Sorted Lists');
    fireEvent.change(titleInput, { target: { value: 'Valid Anagram' } });

    const submitBtn = screen.getByRole('button', { name: /Forge & Publish Quest/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.createAdminProblem).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: 'valid-anagram',
          title: 'Valid Anagram',
          best_time_complexity: 'O(N)',
        })
      );
    });
  });
});
