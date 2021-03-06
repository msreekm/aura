/*
 * Copyright (C) 2013 salesforce.com, inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
({
    createBody: function (component) {
        component.set("v.loaded",false);
        component._itemInfo = [];
        this.buildBody(component,
            function createBodyItem(component, template, item, index, itemVar, indexVar, templateValueProvider, forceServer, callback) {
                this.buildTemplate(component, template, item, index, itemVar, indexVar, templateValueProvider, true, forceServer, callback);
            },
            function createBodyComplete(component, components){
                component.set("v.body", components, true);
                component.set("v.loaded",true);
                component.get("e.iterationComplete").fire({operation:"Initialize"});
            }
        );
    },

    updateBody: function (component) {
        if(component.get("v.loaded")===false){
            return component._queueUpdate=true;
        }
        component.set("v.loaded",false);
        var itemInfo = component._itemInfo.slice();
        component._itemInfo.length = 0;
        var helper=this;
        this.buildBody(component,
            function updateBodyItem(component, template, item, index, itemVar, indexVar, templateValueProvider, forceServer, callback) {
                var found = false;
                var components = null;
                for (var i = 0; i < itemInfo.length; i++) {
                    if (itemInfo[i].item === item) {
                        components = itemInfo[i].components;
                        if (itemInfo[i].index != index) {
                            for (var j = 0; j < components.length; j++) {
                                var avp = components[j].getAttributeValueProvider();
                                if (avp) {
                                    //JBUCH: HALO: FIXME: THIS IS TO DEAL WITH THE CHANGE TO PTVs BELOW:
                                    avp.set(indexVar, index);
                                    avp.set(itemVar, component.getReference("v.items[" + index + "]"), true);
                                }
                            }
                        }
                        found = true;
                        itemInfo.splice(i, 1);
                        this.trackItem(component, item, index, components);
                        callback(components);
                        break;
                    }
                }
                if (!found) {
                    this.buildTemplate(component, template, item, index, itemVar, indexVar, templateValueProvider, false, forceServer, callback);
                }
            },
            function updateBodyComplete(component, components){
            //  if (itemInfo.length) {
            //      We have deletes. Do we even care? RenderingService and Garbage Collection should handle that.
            //      If we do care, it will be to detach PRVs from firing.
            //  }
                component.set("v.body", components);
                component.set("v.loaded",true);
                component.get("e.iterationComplete").fire({operation:"Update"});
                if(component._queueUpdate){
                    helper.updateBody(component);
                }
                component._queueUpdate=false;
            }
        );
    },

    buildBody: function (component, itemHandler, completeHandler) {
        var items = component.get("v.items");
        var template = component.get("v.template");
        if (items && items.length && template && template.length) {
            var itemVar = component.get("v.var");
            var indexVar = component.get("v.indexVar");
            var forceServer = component.get("v.forceServer");
            var templateValueProvider = component.getComponentValueProvider();
            var startIndex = this.getStart(component);
            var endIndex = this.getEnd(component);
            var expectedCalls=endIndex-startIndex;
            var currentCall=0;
            var collector=[];
            function getCollector(index){
                return function(itemComponents){
                    collector[index]=itemComponents;
                    if(++currentCall==expectedCalls){
                        var components=[];
                        for(var i=0;i<collector.length;i++){
                            components=components.concat(collector[i]);
                        }
                        completeHandler(component,components);
                    }
                }
            }
            $A.pushCreationPath("body");
            for (var i = startIndex; i < endIndex; i++) {
                $A.setCreationPathIndex(i);
                itemHandler.bind(this)(component, template, items[i], i, itemVar, indexVar, templateValueProvider, forceServer, getCollector(i-startIndex));
            }
            $A.popCreationPath("body");
        }else{
            completeHandler(component,[]);
        }
    },

    buildTemplate: function (component, template, item, index, itemVar, indexVar, templateValueProvider, localCreation, forceServer, callback) {
        $A.pushCreationPath("body");
        var helper=this;
        var iterationValueProvider = null;
        function collector(templateComponents){
            helper.trackItem(component, item, index, templateComponents);
            callback(templateComponents);
        }
        for (var i = 0; i < template.length; i++) {
            $A.setCreationPathIndex(i);
            var componentDefRef = template[i];
            if (!componentDefRef.valueProvider) {
                componentDefRef.valueProvider = templateValueProvider;
            }
            if (!iterationValueProvider) {
                var itemValueProviders = {};
                itemValueProviders[itemVar] = component.getReference("v.items[" + index + "]");
                itemValueProviders[indexVar] = index;
                iterationValueProvider = $A.expressionService.createPassthroughValue(itemValueProviders, componentDefRef.valueProvider);
            }
            if(localCreation){
                var components=$A.componentService.newComponentDeprecated(template, iterationValueProvider, false, true);
                collector(components);
            }else {
                $A.componentService.newComponentAsync(this, collector, template, iterationValueProvider, localCreation, false, forceServer);
            }
            break;
        }
        $A.popCreationPath("body");
    },

    getStart: function (cmp) {
        return Math.max(0, parseInt(cmp.get("v.start") || 0, 10));
    },

    getEnd: function (cmp) {
        var items = cmp.get("v.items");
        if(items&&items.length){
            var end=parseInt(cmp.get("v.end"), 10);
            return isNaN(end)?items.length:Math.min(items.length, end);
        }
        return 0;
    },

    trackItem: function (component, item, index, components) {
        component._itemInfo.push({
            item: item,
            index: index,
            components: components //,
//			hash : $A.util.json.encode(itemval)
        });
    }
})