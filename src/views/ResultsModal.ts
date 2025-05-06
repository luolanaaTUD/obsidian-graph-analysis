import { App, Modal, TFile } from 'obsidian';
import { Node } from '../types/types';

export class ResultsModal extends Modal {
    results: Node[];
    algorithm: string;

    constructor(app: App, results: Node[], algorithm: string) {
        super(app);
        this.results = results;
        this.algorithm = algorithm;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: `${this.algorithm} Analysis Results` });

        // Create a table for the results
        const table = contentEl.createEl('table');
        table.addClass('graph-analysis-results-table');
        
        // Add table header
        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        headerRow.createEl('th', { text: 'Rank' });
        headerRow.createEl('th', { text: 'Note' });
        headerRow.createEl('th', { text: 'Score' });
        
        // Add table body
        const tbody = table.createEl('tbody');
        this.results.forEach((result, index) => {
            const row = tbody.createEl('tr');
            row.createEl('td', { text: `${index + 1}` });
            
            // Create a clickable link for the note
            const noteCell = row.createEl('td');
            const noteLink = noteCell.createEl('a', { 
                text: result.node_name,
                href: '#'
            });
            noteLink.addEventListener('click', (e) => {
                e.preventDefault();
                // Open the note when clicked
                const file = this.app.vault.getAbstractFileByPath(result.node_name);
                if (file instanceof TFile) {
                    this.app.workspace.getLeaf().openFile(file);
                    this.close();
                }
            });
            
            // Get the centrality score based on the algorithm type
            const score = this.getScoreForAlgorithm(result);
            row.createEl('td', { text: score.toFixed(3) });
        });
        
        // Add a close button
        const buttonContainer = contentEl.createEl('div');
        buttonContainer.addClass('graph-analysis-button-container');
        const closeButton = buttonContainer.createEl('button', { text: 'Close' });
        closeButton.addEventListener('click', () => this.close());
    }

    private getScoreForAlgorithm(node: Node): number {
        // Check if centrality object exists
        if (!node?.centrality) {
            return 0;
        }
        
        // Determine which score to use based on the algorithm name
        const algorithmLower = this.algorithm.toLowerCase();
        
        if (algorithmLower.includes('degree')) {
            return typeof node.centrality.degree === 'number' ? node.centrality.degree : 0;
        } else if (algorithmLower.includes('eigenvector')) {
            return typeof node.centrality.eigenvector === 'number' ? node.centrality.eigenvector : 0;
        } else if (algorithmLower.includes('betweenness')) {
            return typeof node.centrality.betweenness === 'number' ? node.centrality.betweenness : 0;
        } else if (algorithmLower.includes('closeness')) {
            return typeof node.centrality.closeness === 'number' ? node.centrality.closeness : 0;
        }
        
        return 0;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}