/*
 * Copyright (c) 2018 Charles University in Prague, Faculty of Arts,
 *                    Institute of the Czech National Corpus
 * Copyright (c) 2018 Tomas Machalek <tomas.machalek@gmail.com>
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; version 2
 * dated June, 1991.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.

 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */

/// <reference path="../../vendor.d.ts/react.d.ts" />

import {Kontext} from '../../types/common';
import * as React from 'vendor/react';
import * as Immutable from 'immutable';
import {CQLEditorStore, CQLEditorStoreState} from '../../stores/query/cqleditor/store';
import {ActionDispatcher} from '../../app/dispatcher';
import {CQLEditorActions} from '../../stores/query/cqleditor/actions';


export interface CQLEditorProps {
    sourceId:string;
    attachCurrInputElement:(elm:HTMLElement)=>void;
    inputKeyHandler:(evt:KeyboardEvent)=>void;
}

export interface CQLEditorViews {
    CQLEditorFallback:React.ComponentClass;
    CQLEditor:React.ComponentClass;
}


export function init(dispatcher:ActionDispatcher, he:Kontext.ComponentHelpers, editorStore:CQLEditorStore) {

    const actions = new CQLEditorActions(dispatcher);


    // ------------------- <CQLEditorFallback /> -----------------------------

    class CQLEditorFallback extends React.PureComponent<CQLEditorProps, CQLEditorStoreState> {

        constructor(props) {
            super(props);
            this.state = editorStore.getState();
            this.handleStoreChange = this.handleStoreChange.bind(this);
        }

        private handleStoreChange(state:CQLEditorStoreState) {
            this.setState(state);
        }

        componentDidMount() {
            editorStore.addChangeListener(this.handleStoreChange);
        }

        componentWillUnmount() {
            editorStore.removeChangeListener(this.handleStoreChange);
        }

        render():React.ReactElement {
            return <textarea className="cql-input" rows="2" cols="60" name="cql"
                                ref={item => this.props.attachCurrInputElement(item)}
                                value={this.state.rawCode.get(this.props.sourceId)}
                                onKeyDown={this.props.inputKeyHandler}
                                spellCheck={false} />;
        }
    }

    // ------------------- <CQLEditor /> -----------------------------

    class CQLEditor extends React.PureComponent<CQLEditorProps, CQLEditorStoreState> {

        private editorRoot:Node;

        constructor(props:CQLEditorProps) {
            super(props);
            this.editorRoot = null;
            this.state = editorStore.getState();
            this.handleStoreChange = this.handleStoreChange.bind(this);
            this.handleEditorClick = this.handleEditorClick.bind(this);
        }

        private handleStoreChange(state:CQLEditorStoreState) {
            this.setState(state);
        }

        private extractText(root:Node) {
            const ans:Array<[string, Node]> = [];
            for (let i = 0; i < root.childNodes.length; i += 1) {
                const elm = root.childNodes[i];
                switch (elm.nodeType) {
                    case Node.TEXT_NODE:
                        ans.push([elm.nodeValue, elm]);
                    break;
                    case Node.ELEMENT_NODE:
                        ans.splice(ans.length, 0, ...this.extractText(elm));
                    break;
                }
            };
            return ans;
        }

        private reapplySelection(rawAnchorIdx:number, rawFocusIdx:number) {
            const sel = window.getSelection();
            const src = this.extractText(this.editorRoot);
            let anchorNode = this.editorRoot;
            let focusNode = this.editorRoot;
            let currIdx = 0;
            let anchorIdx = 0;
            let focusIdx = 0;

            src.forEach(([text, node]) => {
                const nodeStartIdx = currIdx;
                const nodeEndIdx = nodeStartIdx + text.length;
                if (nodeStartIdx <= rawAnchorIdx && rawAnchorIdx <= nodeEndIdx) {
                    anchorNode = node;
                    anchorIdx = rawAnchorIdx - nodeStartIdx;
                }
                if (nodeStartIdx <= rawFocusIdx && rawFocusIdx <= nodeEndIdx) {
                    focusNode = node;
                    focusIdx = rawFocusIdx - nodeStartIdx;
                }
                currIdx += text.length;
            });
            sel.setBaseAndExtent(anchorNode, anchorIdx, focusNode, focusIdx);
        }

        private getRawSelection(src:Array<[string, Node]>) {
            let rawAnchorIdx = 0;
            let rawFocusIdx = 0;
            let currIdx = 0;
            const sel = window.getSelection();

            src.forEach(([text, node]) => {
                if (node === sel.anchorNode) {
                    rawAnchorIdx = currIdx + sel.anchorOffset;
                }
                if (node === sel.focusNode) {
                    rawFocusIdx = currIdx + sel.focusOffset;
                }
                currIdx += text.length;
            });
            return [rawAnchorIdx, rawFocusIdx];
        }

        private handleInputChange() {
            const src = this.extractText(this.editorRoot);
            const [rawAnchorIdx, rawFocusIdx] = this.getRawSelection(src);
            actions.CQL_EDITOR_SET_RAW_QUERY({
                sourceId: this.props.sourceId,
                query: src.map(v => v[0]).join(''),
                rawAnchorIdx: rawAnchorIdx,
                rawFocusIdx: rawFocusIdx
            });
        }

        private findLinkParent(elm:HTMLElement):HTMLElement {
            let curr = elm;
            while (curr !== this.editorRoot) {
                if (curr.nodeName === 'A') {
                    return curr;
                }
                curr = curr.parentElement;
            }
            return null;
        }

        private handleEditorClick(evt:React.KeyboardEvent) {
            const a = this.findLinkParent(evt.target as HTMLElement);
            if (a !== null && evt.ctrlKey) {
                switch (a.getAttribute('data-type')) {
                    case 'tag':
                        const leftIdx = Number(a.getAttribute('data-leftIdx'));
                        const rightIdx = Number(a.getAttribute('data-rightIdx'));

                        dispatcher.dispatch({
                            actionType: 'TAGHELPER_PRESET_PATTERN',
                            props: {
                                sourceId: this.props.sourceId,
                                pattern: this.state.rawCode.get(this.props.sourceId).substring(leftIdx + 1, rightIdx - 1) // +/-1 = get rid of quotes
                            }
                        });
                        dispatcher.dispatch({
                            actionType: 'QUERY_INPUT_SET_ACTIVE_WIDGET',
                            props: {
                                sourceId: this.props.sourceId,
                                value: 'tag',
                                widgetArgs: {
                                    leftIdx: leftIdx,
                                    rightIdx: rightIdx
                                }
                            }
                        });
                    break;
                }
            }
        }

        private refFn(item) {
            this.props.attachCurrInputElement(item);
            this.editorRoot = item;
        }

        componentDidUpdate(prevProps, prevState) {
            if (this.state.rawAnchorIdx !== null && this.state.rawFocusIdx !== null) {
                this.reapplySelection(this.state.rawAnchorIdx, this.state.rawFocusIdx);
            }
        }

        componentDidMount() {
            editorStore.addChangeListener(this.handleStoreChange);

            if (he.browserInfo.isFirefox()) {
                this.editorRoot.addEventListener('keydown', (evt:KeyboardEvent) => {
                    if (evt.keyCode === 8 || evt.keyCode === 46) {
                        const src = this.extractText(this.editorRoot);
                        const [rawAnchorIdx, rawFocusIdx] = this.getRawSelection(src);
                        const rawSrc = src.map(v => v[0]).join('');

                        if (rawAnchorIdx === rawFocusIdx) {
                            actions.CQL_EDITOR_SET_RAW_QUERY({
                                    query: evt.keyCode === 8 ?
                                        rawSrc.substring(0, rawAnchorIdx - 1) + rawSrc.substring(rawFocusIdx) :
                                        rawSrc.substring(0, rawAnchorIdx) + rawSrc.substring(rawFocusIdx + 1),
                                    sourceId: this.props.sourceId,
                                    rawAnchorIdx: 0, // TODO
                                    rawFocusIdx: 0 // TODO
                            });
                            this.reapplySelection(
                                evt.keyCode === 8 ? rawAnchorIdx - 1 : rawAnchorIdx,
                                evt.keyCode === 8 ? rawFocusIdx - 1 : rawFocusIdx
                            );

                        } else if (rawAnchorIdx < rawFocusIdx) {
                            actions.CQL_EDITOR_SET_RAW_QUERY({
                                query: rawSrc.substring(0, rawAnchorIdx) + rawSrc.substring(rawFocusIdx),
                                sourceId: this.props.sourceId,
                                rawAnchorIdx: 0, // TODO
                                rawFocusIdx: 0 // TODO
                            });
                            this.reapplySelection(rawAnchorIdx, rawAnchorIdx);

                        } else {
                            actions.CQL_EDITOR_SET_RAW_QUERY({
                                query: rawSrc.substring(0, rawFocusIdx) + rawSrc.substring(rawAnchorIdx),
                                sourceId: this.props.sourceId,
                                rawAnchorIdx: 0, // TODO
                                rawFocusIdx: 0 // TODO
                            });
                            this.reapplySelection(rawFocusIdx, rawFocusIdx);
                        }
                        evt.preventDefault();
                    }
                });
            }
        }

        componentWillUnmount() {
            editorStore.removeChangeListener(this.handleStoreChange);
        }

        render() {
            return <pre contentEditable={true}
                            spellCheck={false}
                            onInput={(evt) => this.handleInputChange()}
                            onClick={this.handleEditorClick}
                            className="cql-input"
                            style={{width: '40em', height: '5em'}}
                            ref={(item) => this.refFn(item)}
                            dangerouslySetInnerHTML={{__html: this.state.richCode.get(this.props.sourceId)}}
                            onKeyDown={this.props.inputKeyHandler} />;
        }
    }


    return {
        CQLEditor: CQLEditor,
        CQLEditorFallback: CQLEditorFallback
    };


}