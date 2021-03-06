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

import {Kontext, KeyCodes} from '../../types/common';
import * as React from 'react';
import {CQLEditorModel, CQLEditorModelState} from '../../models/query/cqleditor/model';
import {ActionDispatcher} from '../../app/dispatcher';
import {GeneralQueryModel} from '../../models/query/main';


export interface CQLEditorProps {
    sourceId:string;
    takeFocus:boolean;
    initialValue:string;
    inputChangeHandler:(evt:React.ChangeEvent<HTMLTextAreaElement>)=>void;
    inputKeyHandler:(evt:React.KeyboardEvent<{}>)=>void;
}

export interface CQLEditorViews {
    CQLEditorFallback:React.ComponentClass;
    CQLEditor:React.ComponentClass;
}


export function init(dispatcher:ActionDispatcher, he:Kontext.ComponentHelpers,
            queryModel:GeneralQueryModel, editorModel:CQLEditorModel) {


    // ------------------- <CQLEditorFallback /> -----------------------------

    class CQLEditorFallback extends React.PureComponent<CQLEditorProps, {query:string}> {

        private _queryInputElement:React.RefObject<HTMLTextAreaElement>;

        constructor(props) {
            super(props);
            this.state = {query: this.props.initialValue};
            this.handleModelChange = this.handleModelChange.bind(this);
            this._queryInputElement = React.createRef();
        }

        private handleModelChange() {
            this.setState({query: queryModel.getQuery(this.props.sourceId)});
        }

        componentDidMount() {
            queryModel.addChangeListener(this.handleModelChange);
            if (this.props.takeFocus && this._queryInputElement.current) {
                this._queryInputElement.current.focus();
            }
        }

        componentWillUnmount() {
            queryModel.removeChangeListener(this.handleModelChange);
        }

        render():React.ReactElement<{}> {
            return <textarea className="cql-input" rows={2} cols={60} name="cql"
                                ref={this._queryInputElement}
                                value={this.state.query}
                                onKeyDown={this.props.inputKeyHandler}
                                onChange={this.props.inputChangeHandler}
                                spellCheck={false} />;
        }
    }

    // ------------------- <CQLEditor /> -----------------------------

    class CQLEditor extends React.Component<CQLEditorProps, CQLEditorModelState> {

        private _queryInputElement:React.RefObject<HTMLPreElement>;

        constructor(props:CQLEditorProps) {
            super(props);
            this.state = editorModel.getState();
            this.handleModelChange = this.handleModelChange.bind(this);
            this.handleEditorClick = this.handleEditorClick.bind(this);
            this._queryInputElement = React.createRef();
        }

        private handleModelChange(state:CQLEditorModelState) {
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
            const src = this.extractText(this._queryInputElement.current);
            let anchorNode = this._queryInputElement.current;
            let focusNode = this._queryInputElement.current;
            let currIdx = 0;
            let anchorIdx = 0;
            let focusIdx = 0;

            src.forEach(([text, node]) => {
                const nodeStartIdx = currIdx;
                const nodeEndIdx = nodeStartIdx + text.length;
                if (nodeStartIdx <= rawAnchorIdx && rawAnchorIdx <= nodeEndIdx) {
                    anchorNode = node as HTMLPreElement;
                    anchorIdx = rawAnchorIdx - nodeStartIdx;
                }
                if (nodeStartIdx <= rawFocusIdx && rawFocusIdx <= nodeEndIdx) {
                    focusNode = node as HTMLPreElement;
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
            const src = this.extractText(this._queryInputElement.current);
            const [rawAnchorIdx, rawFocusIdx] = this.getRawSelection(src);

            dispatcher.dispatch({
                actionType: 'CQL_EDITOR_SET_RAW_QUERY',
                props: {
                    sourceId: this.props.sourceId,
                    query: src.map(v => v[0]).join(''),
                    rawAnchorIdx: rawAnchorIdx,
                    rawFocusIdx: rawFocusIdx
                }
            });
        }

        private findLinkParent(elm:HTMLElement):HTMLElement {
            let curr = elm;
            while (curr !== this._queryInputElement.current) {
                if (curr.nodeName === 'A') {
                    return curr;
                }
                curr = curr.parentElement;
            }
            return null;
        }

        private handleEditorClick(evt:React.MouseEvent<{}>) {
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

        shouldComponentUpdate(nextProps, nextState) {
            return this.state.rawAnchorIdx.get(this.props.sourceId) !== nextState.rawAnchorIdx.get(this.props.sourceId) ||
                    this.state.rawFocusIdx.get(this.props.sourceId) !== nextState.rawFocusIdx.get(this.props.sourceId) ||
                    this.state.rawCode.get(this.props.sourceId) !== nextState.rawCode.get(this.props.sourceId) ||
                    this.state.richCode.get(this.props.sourceId) !== nextState.richCode.get(this.props.sourceId) ||
                    // we want non-strict comparison below because message map is initialized as empty
                    // but even  editor interaction without generated message writes a [corp]=>null which
                    // changes the object
                    this.state.message.get(this.props.sourceId) != nextState.message.get(this.props.sourceId) ||
                    this.state.isEnabled !== nextState.isEnabled;
        }

        componentDidUpdate(prevProps, prevState) {
            if (this.state.rawAnchorIdx !== null && this.state.rawFocusIdx !== null) {
                this.reapplySelection(
                    this.state.rawAnchorIdx.get(this.props.sourceId),
                    this.state.rawFocusIdx.get(this.props.sourceId)
                );
            }
        }

        componentDidMount() {
            editorModel.addChangeListener(this.handleModelChange);
            if (this.props.takeFocus && this._queryInputElement.current) {
                this._queryInputElement.current.focus();
            }

            if (this.props.initialValue) {
                dispatcher.dispatch({
                    actionType: 'CQL_EDITOR_SET_RAW_QUERY',
                    props: {
                        query: this.props.initialValue,
                        sourceId: this.props.sourceId,
                        rawAnchorIdx: this.props.initialValue.length,
                        rawFocusIdx: this.props.initialValue.length
                    }
                });
            }

            if (he.browserInfo.isFirefox()) {
                this._queryInputElement.current.addEventListener('keydown', (evt:KeyboardEvent) => {
                    if (evt.keyCode === KeyCodes.BACKSPACE || evt.keyCode === KeyCodes.DEL) {
                        const src = this.extractText(this._queryInputElement.current);
                        const [rawAnchorIdx, rawFocusIdx] = this.getRawSelection(src);
                        const rawSrc = src.map(v => v[0]).join('');

                        if (rawAnchorIdx === rawFocusIdx) {
                            dispatcher.dispatch({
                                actionType: 'CQL_EDITOR_SET_RAW_QUERY',
                                props: {
                                    query: evt.keyCode === KeyCodes.BACKSPACE ?
                                        rawSrc.substring(0, rawAnchorIdx - 1) + rawSrc.substring(rawFocusIdx) :
                                        rawSrc.substring(0, rawAnchorIdx) + rawSrc.substring(rawFocusIdx + 1),
                                    sourceId: this.props.sourceId,
                                    rawAnchorIdx: evt.keyCode === KeyCodes.BACKSPACE ? rawAnchorIdx - 1 : rawAnchorIdx,
                                    rawFocusIdx: evt.keyCode === KeyCodes.BACKSPACE ? rawFocusIdx - 1 : rawFocusIdx
                                }
                            });
                            this.reapplySelection(
                                evt.keyCode === KeyCodes.BACKSPACE ? rawAnchorIdx - 1 : rawAnchorIdx,
                                evt.keyCode === KeyCodes.BACKSPACE ? rawFocusIdx - 1 : rawFocusIdx
                            );

                        } else if (rawAnchorIdx < rawFocusIdx) {
                            dispatcher.dispatch({
                                actionType: 'CQL_EDITOR_SET_RAW_QUERY',
                                props: {
                                    query: rawSrc.substring(0, rawAnchorIdx) + rawSrc.substring(rawFocusIdx),
                                    sourceId: this.props.sourceId,
                                    rawAnchorIdx: evt.keyCode === KeyCodes.BACKSPACE ? rawAnchorIdx : rawAnchorIdx,
                                    rawFocusIdx: evt.keyCode === KeyCodes.BACKSPACE ? rawAnchorIdx : rawAnchorIdx,
                                }
                            });
                            this.reapplySelection(
                                evt.keyCode === KeyCodes.BACKSPACE ? rawAnchorIdx : rawAnchorIdx,
                                evt.keyCode === KeyCodes.BACKSPACE ? rawAnchorIdx : rawAnchorIdx
                            );

                        } else {
                            dispatcher.dispatch({
                                actionType: 'CQL_EDITOR_SET_RAW_QUERY',
                                props: {
                                    query: rawSrc.substring(0, rawFocusIdx) + rawSrc.substring(rawAnchorIdx),
                                    sourceId: this.props.sourceId,
                                    rawAnchorIdx: evt.keyCode === KeyCodes.BACKSPACE ? rawFocusIdx : rawFocusIdx,
                                    rawFocusIdx: evt.keyCode === KeyCodes.BACKSPACE ? rawFocusIdx : rawFocusIdx,
                                }
                            });
                            this.reapplySelection(
                                evt.keyCode === KeyCodes.BACKSPACE ? rawFocusIdx : rawFocusIdx,
                                evt.keyCode === KeyCodes.BACKSPACE ? rawFocusIdx : rawFocusIdx
                            );
                        }
                        evt.preventDefault();
                    }
                });
            }
        }

        componentWillUnmount() {
            editorModel.removeChangeListener(this.handleModelChange);
        }

        render() {
            return <pre contentEditable={true}
                            spellCheck={false}
                            onInput={(evt) => this.handleInputChange()}
                            onClick={this.handleEditorClick}
                            className="cql-input"
                            style={{width: '100%', minWidth: '40em', height: '5em'}}
                            ref={this._queryInputElement}
                            dangerouslySetInnerHTML={{__html: this.state.richCode.get(this.props.sourceId)}}
                            onKeyDown={this.props.inputKeyHandler} />;
        }
    }


    return {
        CQLEditor: CQLEditor,
        CQLEditorFallback: CQLEditorFallback
    };


}