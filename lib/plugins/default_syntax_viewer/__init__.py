# Copyright (c) 2016 Institute of the Czech National Corpus
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License
# as published by the Free Software Foundation; version 2
# dated June, 1991.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.

# You should have received a copy of the GNU General Public License
# along with this program; if not, write to the Free Software
# Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA
# 02110-1301, USA.

"""
A plug-in providing syntax tree display. Its client-side part
is based on the 'js-treex-view' library (https://github.com/ufal/js-treex-view).
The tree data are extracted from Manatee where it is expected from
a token to contain an attribute with a relative reference to its parent.
All the properties are configured via an external JSON file.

Configuration JSON:
{
  "corpora": {
    ... this is backend dependent, see backend modules for details ...
  }
}
"""

import json
import os

import plugins
from plugins.abstract.syntax_viewer import SyntaxViewerPlugin, MaximumContextExceeded
from actions import concordance
from controller import exposed
from manatee_backend import ManateeBackend
from translation import ugettext as _


@exposed(return_type='json')
def get_syntax_data(ctrl, request):
    """
    This is the actual controller method exported by the plug-in.
    To be able to export a JSON with custom encoder this method
    returns a callable which ensures that controller.Controller
    skips its simple JSON serialization.
    """
    try:
        corp = getattr(ctrl, '_corp')()
        canonical_corpname = getattr(ctrl, '_canonical_corpname')(corp.corpname)
        data = plugins.get('syntax_viewer').search_by_token_id(corp, canonical_corpname,
                                                               int(request.args.get('kwic_id')))
    except MaximumContextExceeded:
        data = dict(contains_errors=True,
                    error=_('Failed to get the syntax tree due to limited KWIC context (too long sentence).'))
    return data


class SyntaxDataProviderError(Exception):
    pass


class SyntaxDataProvider(SyntaxViewerPlugin):

    def __init__(self, corpora_conf, backend, auth):
        self._conf = corpora_conf
        self._backend = backend
        self._auth = auth

    def search_by_token_id(self, corp, canonical_corpname, token_id):
        data, encoder = self._backend.get_data(corp, canonical_corpname, token_id)
        # we must return a callable to force our custom JSON encoding
        return lambda: json.dumps(data, cls=encoder)

    def is_enabled_for(self, corpname):
        return self._auth.canonical_corpname(corpname) in self._conf

    def export_actions(self):
        return {concordance.Actions: [get_syntax_data]}


@plugins.inject('auth')
def create_instance(conf, auth):
    conf_path = conf.get('plugins', 'syntax_viewer', {}).get('default:config_path')
    if not conf_path or not os.path.isfile(conf_path):
        raise SyntaxDataProviderError('Plug-in configuration file [%s] not found. Please check default:config_path.' %
                                      (conf_path,))
    with open(conf_path, 'rb') as f:
        conf_data = json.load(f)
        corpora_conf = conf_data.get('corpora', {})
    return SyntaxDataProvider(corpora_conf, ManateeBackend(corpora_conf), auth)
